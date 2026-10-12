import { ChannelType, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, v2Flags } from '../utils/components.js';
import { saveConfig } from '../utils/storage.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('autobypass').setDescription('Manage automatic URL bypass in channels')
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable auto-bypass in a text channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to monitor; defaults to this channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable auto-bypass in a text channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to stop monitoring').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List monitored channels')),
  ownerOnly: true,
  async execute(interaction, state) {
    if (!interaction.guildId) { await interaction.reply({ components: [panel('Server only', 'Run this command inside a server.')], flags: v2Flags }); return; }
    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      const rows = state.autoBypassChannels.filter((item) => item.guildId === interaction.guildId);
      await interaction.reply({ components: [panel('Auto-bypass channels', rows.length ? rows.map((row) => `• <#${row.channelId}>`).join('\n') : 'No channels are being monitored in this server.')], flags: v2Flags }); return;
    }
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ components: [panel('Invalid channel', 'Choose a standard text channel.')], flags: v2Flags }); return; }
    const exists = state.autoBypassChannels.some((item) => item.guildId === interaction.guildId && item.channelId === channel.id);
    if (action === 'enable' && !exists) state.autoBypassChannels.push({ guildId: interaction.guildId, channelId: channel.id, deleteSource: false });
    if (action === 'disable') state.autoBypassChannels = state.autoBypassChannels.filter((item) => !(item.guildId === interaction.guildId && item.channelId === channel.id));
    await saveConfig(state);
    await interaction.reply({ components: [panel('Auto-bypass updated', action === 'enable' ? `Now monitoring <#${channel.id}> for supported URLs.` : `Stopped monitoring <#${channel.id}>.`)], flags: v2Flags });
  },
};
export default command;
