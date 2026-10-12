import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { config } from '../config.js';
import { databaseEnabled } from '../services/database.js';
import { bypassCoreStats, providerHealthSnapshot } from '../services/bypass.js';
import { panel, publicV2Flags } from '../utils/components.js';

const startedAt = Date.now();

const command: Command = {
  data: new SlashCommandBuilder().setName('status').setDescription('Show BypassX status and latency'),
  async execute(interaction, state) {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const uptime = `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;
    const core = bypassCoreStats();
    const cooldowns = providerHealthSnapshot().filter((provider) => provider.cooldownUntil).length;
    await interaction.reply({ components: [panel('BypassX status', [
      `Gateway: **online** · **${interaction.client.ws.ping}ms**`,
      `Storage: **${databaseEnabled ? 'Neon Postgres' : 'Local JSON fallback'}**`,
      `Authorized guilds: **${state.authorizedGuildIds.length}**`,
      `Auto-bypass channels: **${state.autoBypassChannels.length}**`,
      `Providers in chain: **${state.fallbackApis.length + 3}**`,
      `Provider cooldowns: **${cooldowns ? `${cooldowns} active` : 'none'}**`,
      `Result cache: **${core.cacheEntries} entries** · **${core.cacheTtlSeconds}s TTL**`,
      `Uptime: **${uptime}**`,
      `Status rotation: **every ${config.statusIntervalSeconds}s**`,
    ].join('\n'))], flags: publicV2Flags });
  },
};
export default command;
