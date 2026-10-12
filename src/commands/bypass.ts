import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { bypass } from '../services/bypass.js';
import { panel, publicV2Flags, v2Flags } from '../utils/components.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('bypass').setDescription('Resolve a supported ad-link or key-system URL')
    .addStringOption((option) => option.setName('url').setDescription('The URL to resolve').setRequired(true)),
  async execute(interaction, state) {
    const url = interaction.options.getString('url', true).trim();
    let parsed: URL;
    try { parsed = new URL(url.includes('://') ? url : `https://${url}`); }
    catch { await interaction.reply({ components: [panel('Invalid URL', 'Please provide a valid http(s) URL.')], flags: v2Flags }); return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      await interaction.reply({ components: [panel('Invalid URL', 'Only http(s) URLs are accepted.')], flags: v2Flags }); return;
    }
    await interaction.deferReply({ flags: v2Flags });
    const result = await bypass(parsed.toString(), state.fallbackApis);
    if (!result.ok) {
      await interaction.editReply({ components: [panel('Bypass failed', `All providers failed.\n\n\`\`\`${result.error}\`\`\``)] }); return;
    }
    const description = result.pending
      ? `This provider returned a pending human-check flow.\n\nProvider: **${result.provider}**${result.captchaUrl ? `\n[Open verification](${result.captchaUrl})` : ''}`
      : `Provider: **${result.provider}**${result.service ? ` · ${result.service}` : ''}${result.ms ? ` · ${result.ms}ms` : ''}`;
    await interaction.editReply({ components: [panel('BypassX result', description, result.destination)] });
  },
};
export default command;
