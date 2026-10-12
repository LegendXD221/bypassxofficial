import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, v2Flags } from '../utils/components.js';
import { saveConfig, validApi } from '../utils/storage.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('api').setDescription('Manage fallback bypass providers')
    .addSubcommand((sub) => sub.setName('list').setDescription('List configured providers'))
    .addSubcommand((sub) => sub.setName('add').setDescription('Add a fallback provider')
      .addStringOption((o) => o.setName('name').setDescription('Provider name').setRequired(true))
      .addStringOption((o) => o.setName('endpoint').setDescription('HTTPS POST endpoint accepting { url }').setRequired(true))
      .addStringOption((o) => o.setName('auth_env').setDescription('Optional environment variable containing its bearer token')))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Remove a fallback provider')
      .addStringOption((o) => o.setName('name').setDescription('Provider name').setRequired(true))),
  ownerOnly: true,
  async execute(interaction, state) {
    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      const names = state.fallbackApis.length ? state.fallbackApis.map((api) => `• **${api.name}** — \`${api.endpoint}\``).join('\n') : 'No fallback providers configured.';
      await interaction.reply({ components: [panel('Fallback providers', names)], flags: v2Flags }); return;
    }
    const name = interaction.options.getString('name', true).trim();
    if (action === 'remove') {
      const before = state.fallbackApis.length;
      state.fallbackApis = state.fallbackApis.filter((api) => api.name.toLowerCase() !== name.toLowerCase());
      await saveConfig(state);
      await interaction.reply({ components: [panel('Fallback provider', before === state.fallbackApis.length ? 'No provider matched that name.' : `Removed **${name}**.`)], flags: v2Flags }); return;
    }
    const endpoint = interaction.options.getString('endpoint', true).trim();
    const candidate = { name, endpoint, method: 'POST' as const, adapter: 'generic' as const, authEnv: interaction.options.getString('auth_env')?.trim() || undefined };
    if (!validApi(candidate)) { await interaction.reply({ components: [panel('Invalid provider', 'Use a valid http(s) endpoint.')], flags: v2Flags }); return; }
    state.fallbackApis = [...state.fallbackApis.filter((api) => api.name.toLowerCase() !== name.toLowerCase()), candidate];
    await saveConfig(state);
    await interaction.reply({ components: [panel('Fallback provider added', `**${name}** will be tried after Alysse.`)], flags: v2Flags });
  },
};
export default command;
