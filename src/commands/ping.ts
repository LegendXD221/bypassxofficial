import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, publicV2Flags } from '../utils/components.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check BypassX latency'),
  async execute(interaction) { await interaction.reply({ components: [panel('Pong', `WebSocket latency: **${interaction.client.ws.ping}ms**`)], flags: publicV2Flags }); },
};
export default command;
