import { REST, Routes } from 'discord.js';
import { config, assertConfig } from './config.js';
import { loadCommands } from './index.js';

assertConfig();
const commands = (await loadCommands()).map((command) => command.data.toJSON());
const rest = new REST({ version: '10' }).setToken(config.token);
if (config.guildId) await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
else await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
console.log(`Deployed ${commands.length} commands ${config.guildId ? `to guild ${config.guildId}` : 'globally'}.`);
