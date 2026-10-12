import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { config } from '../config.js';
import { panel, v2Flags } from '../utils/components.js';
import { saveConfig } from '../utils/storage.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('server').setDescription('Manage BypassX server authorization')
    .addSubcommand((sub) => sub.setName('authorize').setDescription('Authorize this server'))
    .addSubcommand((sub) => sub.setName('deauthorize').setDescription('Remove this server authorization'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Show this server authorization status')),
  ownerOnly: true,
  async execute(interaction, state) {
    if (!interaction.guildId || !interaction.guild) { await interaction.reply({ components: [panel('Server only', 'Run this command inside a server.')], flags: v2Flags }); return; }
    const guild = interaction.guild;
    const action = interaction.options.getSubcommand();
    const authorized = state.authorizedGuildIds.includes(interaction.guildId);
    if (action === 'authorize' && !authorized) { state.authorizedGuildIds.push(interaction.guildId); await saveConfig(state); }
    if (action === 'deauthorize' && authorized) { state.authorizedGuildIds = state.authorizedGuildIds.filter((id) => id !== interaction.guildId); await saveConfig(state); }
    const nowAuthorized = action === 'authorize' || (action === 'status' && authorized);
    await interaction.reply({ components: [panel('Server access', nowAuthorized ? `**${guild.name}** is authorized to use BypassX.` : `**${guild.name}** is not authorized.`)], flags: v2Flags });
  },
};
export default command;
