import type { ChatInputCommandInteraction } from 'discord.js';
import type { PersistedConfig } from '../types.js';

export type Command = {
  data: { name: string; toJSON: () => object };
  execute: (interaction: ChatInputCommandInteraction, state: PersistedConfig) => Promise<void>;
  ownerOnly?: boolean;
};
