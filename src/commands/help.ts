import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, publicV2Flags } from '../utils/components.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show BypassX commands'),
  async execute(interaction) {
    await interaction.reply({ components: [panel('BypassX commands', [
      '`/bypass url:<link>` — resolve a supported link',
      '`/autobypass enable|disable|list` — monitor a channel for links (owner only)',
      '`/status` — show gateway, provider, and cache health',
      '`/server authorize|deauthorize|status` — manage guild access (owner only)',
      '`/api list|add|remove` — manage fallback providers (owner only)',
      '`/help` — show this help',
    ].join('\n'))], flags: publicV2Flags });
  },
};
export default command;
