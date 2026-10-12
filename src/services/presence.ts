import { ActivityType, type Client } from 'discord.js';
import { config } from '../config.js';
import type { PersistedConfig } from '../types.js';

const defaultMessages = [
  'Use /bypass to resolve links',
  'Alysse → UseBypass → OmegaTech',
  'Components V2 online',
  'Protecting authorized servers',
];

function messages(state: PersistedConfig): string[] {
  return (config.statusMessages.length ? config.statusMessages : defaultMessages).map((message) =>
    message.replaceAll('{guilds}', String(state.authorizedGuildIds.length))
      .replaceAll('{channels}', String(state.autoBypassChannels.length))
      .replaceAll('{providers}', String(state.fallbackApis.length + 3)),
  );
}

export function startStatusRotator(client: Client, state: PersistedConfig): NodeJS.Timeout {
  let index = 0;
  const rotate = (): void => {
    if (!client.user) return;
    const items = messages(state);
    client.user.setPresence({
      activities: [{ name: items[index % items.length], type: ActivityType.Watching }],
      status: 'online',
    });
    index += 1;
  };
  rotate();
  return setInterval(rotate, config.statusIntervalSeconds * 1000);
}
