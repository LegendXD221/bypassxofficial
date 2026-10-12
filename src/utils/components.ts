import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

export function panel(title: string, body: string, link?: string): ContainerBuilder {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (link) {
    container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('Open destination').setStyle(ButtonStyle.Link).setURL(link),
    ));
  }
  return container;
}

export const v2Flags = 1 << 15 | 1 << 6; // IsComponentsV2 | Ephemeral
export const publicV2Flags = 1 << 15;
