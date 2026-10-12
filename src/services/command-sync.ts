import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import type { Command } from '../commands/types.js';

export async function syncCommands(commands: Command[]): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((command) => command.data.toJSON());
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    if (process.env.CLEAR_GLOBAL_COMMANDS !== 'false') {
      await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
      console.log('Cleared stale global application commands.');
    }
    console.log(`Synchronized ${body.length} commands to guild ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Synchronized ${body.length} global application commands. Global propagation can take up to an hour.`);
  }
}
