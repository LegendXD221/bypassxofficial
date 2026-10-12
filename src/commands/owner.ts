import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, v2Flags } from '../utils/components.js';
import { databaseEnabled, databaseStats } from '../services/database.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('owner').setDescription('Owner-only BypassX controls')
    .addSubcommand((sub) => sub.setName('stats').setDescription('Show bot and database statistics'))
    .addSubcommand((sub) => sub.setName('health').setDescription('Check provider and storage health')),
  ownerOnly: true,
  async execute(interaction, state) {
    const action = interaction.options.getSubcommand();
    if (action === 'stats') {
      const stats = await databaseStats();
      await interaction.reply({ components: [panel('BypassX owner dashboard', [
        `Storage: **${databaseEnabled ? 'Neon Postgres' : 'Local JSON fallback'}**`,
        `Authorized guilds: **${databaseEnabled ? stats.guilds : state.authorizedGuildIds.length}**`,
        `Custom providers: **${databaseEnabled ? stats.providers : state.fallbackApis.length}**`,
        `Auto-bypass channels: **${databaseEnabled ? stats.channels : state.autoBypassChannels.length}**`,
        `Audit events: **${databaseEnabled ? stats.audits : 'not stored locally'}**`,
      ].join('\n'))], flags: v2Flags });
      return;
    }
    await interaction.reply({ components: [panel('BypassX health', `Storage: **${databaseEnabled ? 'Neon connected' : 'Local fallback'}**\nProviders in chain: **${state.fallbackApis.length + 3}**\nAuto-bypass channels: **${state.autoBypassChannels.length}**`)], flags: v2Flags });
  },
};
export default command;
