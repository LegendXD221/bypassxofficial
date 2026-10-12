import { config, assertConfig } from './config.js';
import { loadCommands } from './index.js';
import { syncCommands } from './services/command-sync.js';

assertConfig();
const commands = await loadCommands();
await syncCommands(commands);
