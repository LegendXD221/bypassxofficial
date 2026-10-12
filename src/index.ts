import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertConfig, config } from './config.js';
import type { Command } from './commands/types.js';
import { bypass } from './services/bypass.js';
import { audit } from './services/database.js';
import { initializeStorage, loadConfig } from './utils/storage.js';
import { panel, publicV2Flags } from './utils/components.js';
import { startHealthServer } from './web.js';
import { startStatusRotator } from './services/presence.js';
import { syncCommands } from './services/command-sync.js';
import { parsePublicUrl } from './utils/urls.js';

export async function loadCommands(): Promise<Command[]> {
  const directory = dirname(fileURLToPath(import.meta.url));
  const files = (await readdir(join(directory, 'commands'))).filter((file) => file.endsWith('.js') || file.endsWith('.ts'));
  const loaded: Command[] = [];
  for (const file of files) {
    const module = await import(pathToFileURL(join(directory, 'commands', file)).href);
    if (module.default?.data && module.default?.execute) loaded.push(module.default as Command);
  }
  return loaded;
}

const urlPattern = /https?:\/\/[^\s<>()]+/gi;

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  assertConfig();
  await initializeStorage();
  const state = await loadConfig();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const commands = new Collection<string, Command>();
  const loadedCommands = await loadCommands();
  for (const command of loadedCommands) commands.set(command.data.name, command);
  if (process.env.AUTO_SYNC_COMMANDS !== 'false') await syncCommands(loadedCommands);
  const healthServer = startHealthServer({
    port: config.port,
    isReady: () => client.isReady(),
    getStats: () => ({ authorizedGuilds: state.authorizedGuildIds.length, autoBypassChannels: state.autoBypassChannels.length, commands: commands.size }),
  });
  const cooldowns = new Map<string, number>();

  client.once(Events.ClientReady, (ready) => {
    startStatusRotator(client, state);
    console.log(`BypassX online as ${ready.user.tag}; ${commands.size} commands loaded; ${state.autoBypassChannels.length} auto-bypass channels active.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;
    if (command.ownerOnly && !config.owners.has(interaction.user.id)) {
      await interaction.reply({ content: 'Only configured BypassX owners can use this command.', flags: MessageFlags.Ephemeral }); return;
    }
    if (!command.ownerOnly && !interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used inside an authorized server.', flags: MessageFlags.Ephemeral }); return;
    }
    if (!command.ownerOnly && interaction.guildId && !state.authorizedGuildIds.includes(interaction.guildId)) {
      await interaction.reply({ content: 'This server is not authorized for BypassX. Ask a bot owner to run `/server authorize` here.', flags: MessageFlags.Ephemeral }); return;
    }
    try {
      await command.execute(interaction, state);
      await audit(`command.${interaction.commandName}`, interaction.user.id, interaction.guildId, { subcommand: interaction.options.getSubcommand(false) });
    } catch (error) {
      console.error(error);
      const message = { content: 'Something went wrong while processing that command.', flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(message); else await interaction.reply(message);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guildId || !state.authorizedGuildIds.includes(message.guildId)) return;
    const channelConfig = state.autoBypassChannels.find((item) => item.guildId === message.guildId && item.channelId === message.channelId);
    if (!channelConfig) return;
    const urls = [...new Set((message.content.match(urlPattern) ?? []).map((url) => url.replace(/[.,!?;:]+$/, '')))].slice(0, Math.max(1, config.autoBypassMaxUrlsPerMessage));
    if (!urls.length) return;
    const cooldownKey = `${message.guildId}:${message.channelId}:${message.author.id}`;
    const now = Date.now();
    const lastRun = cooldowns.get(cooldownKey) ?? 0;
    if (now - lastRun < Math.max(0, config.autoBypassCooldownSeconds) * 1000) return;
    cooldowns.set(cooldownKey, now);
    setTimeout(() => cooldowns.delete(cooldownKey), Math.max(1, config.autoBypassCooldownSeconds) * 1000 + 1000);
    const parsed = parsePublicUrl(urls[0]);
    if (!parsed) return;
    try {
      const progressMessage = await message.reply({
        components: [panel('BypassX', `<@${message.author.id}> is bypassing link...`)],
        flags: publicV2Flags,
      });
      const result = await bypass(parsed.toString(), state.fallbackApis);
      const description = result.ok
        ? `Detected from <@${message.author.id}>\nProvider: **${result.provider}**${result.service ? ` · ${result.service}` : ''}${result.cached ? ' · cached' : ''}`
        : `All providers failed.\n\n\`\`\`${result.error}\`\`\``;
      await progressMessage.edit({ components: [panel(result.ok ? 'Automatic bypass result' : 'Automatic bypass failed', description, result.destination)] });
      await audit('autobypass.resolve', message.author.id, message.guildId, { channelId: message.channelId, provider: result.provider, ok: result.ok });
      if (channelConfig.deleteSource) {
        setTimeout(() => {
          void Promise.allSettled([message.delete(), progressMessage.delete()]);
        }, config.autoBypassDeleteAfterSeconds * 1000);
      }
    } catch (error) { console.error('Auto-bypass error:', error); }
  });

  try { await client.login(config.token); }
  catch (error) { healthServer.close(); throw error; }
}
