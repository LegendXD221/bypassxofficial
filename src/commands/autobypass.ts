import { ChannelType, SlashCommandBuilder, type TextChannel } from 'discord.js';
import type { Command } from './types.js';
import { panel, publicV2Flags, v2Flags } from '../utils/components.js';
import { saveConfig } from '../utils/storage.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('autobypass').setDescription('Manage automatic URL bypass in channels')
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable auto-bypass in a text channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to monitor; defaults to this channel').addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('delete_after_30s').setDescription('Delete each user link and paired bot result after 30 seconds')))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable auto-bypass in a text channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel to stop monitoring').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((sub) => sub.setName('list').setDescription('List monitored channels'))
    .addSubcommand((sub) => sub.setName('cleanup').setDescription('Enable or disable paired message cleanup')
      .addChannelOption((o) => o.setName('channel').setDescription('Monitored text channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addBooleanOption((o) => o.setName('enabled').setDescription('Delete the triggering user message and its bot result').setRequired(true))),
  ownerOnly: true,
  async execute(interaction, state) {
    if (!interaction.guildId) { await interaction.reply({ components: [panel('Server only', 'Run this command inside a server.')], flags: v2Flags }); return; }
    const action = interaction.options.getSubcommand();
    if (action === 'list') {
      const rows = state.autoBypassChannels.filter((item) => item.guildId === interaction.guildId);
      await interaction.reply({ components: [panel('Auto-bypass channels', rows.length ? rows.map((row) => `• <#${row.channelId}> · cleanup **${row.deleteSource ? 'on' : 'off'}**`).join('\n') : 'No channels are being monitored in this server.')], flags: v2Flags }); return;
    }
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) { await interaction.reply({ components: [panel('Invalid channel', 'Choose a standard text channel.')], flags: v2Flags }); return; }
    const exists = state.autoBypassChannels.some((item) => item.guildId === interaction.guildId && item.channelId === channel.id);
    if (action === 'cleanup') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const target = state.autoBypassChannels.find((item) => item.guildId === interaction.guildId && item.channelId === channel.id);
      if (!target) { await interaction.reply({ components: [panel('Channel is not enabled', `Enable auto-bypass in <#${channel.id}> first.`)], flags: v2Flags }); return; }
      target.deleteSource = enabled;
      await saveConfig(state);
      await interaction.reply({ components: [panel('Auto-bypass cleanup updated', `Cleanup is now **${enabled ? 'enabled' : 'disabled'}** in <#${channel.id}>.`)], flags: v2Flags }); return;
    }
    const deleteAfter = interaction.options.getBoolean('delete_after_30s');
    if (action === 'enable' && !exists) state.autoBypassChannels.push({ guildId: interaction.guildId, channelId: channel.id, deleteSource: deleteAfter ?? false });
    if (action === 'enable' && exists && deleteAfter !== null) state.autoBypassChannels.find((item) => item.guildId === interaction.guildId && item.channelId === channel.id)!.deleteSource = deleteAfter;
    if (action === 'disable') state.autoBypassChannels = state.autoBypassChannels.filter((item) => !(item.guildId === interaction.guildId && item.channelId === channel.id));
    await saveConfig(state);
    await interaction.reply({ components: [panel('Auto-bypass updated', action === 'enable' ? `Now monitoring <#${channel.id}> for supported URLs.\nCleanup: **${state.autoBypassChannels.find((item) => item.channelId === channel.id)?.deleteSource ? 'on' : 'off'}**` : `Stopped monitoring <#${channel.id}>.`)], flags: v2Flags });
    if (action === 'enable') await (channel as TextChannel).send({ components: [panel('AutoBypass Enabled', 'Paste Links To Bypass Them')], flags: publicV2Flags });
  },
};
export default command;
