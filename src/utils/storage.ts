import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import type { FallbackApi, PersistedConfig } from '../types.js';
import { databaseEnabled, initializeDatabase, loadDatabaseConfig, saveDatabaseConfig } from '../services/database.js';

const defaults = (): PersistedConfig => ({
  authorizedGuildIds: [...config.defaultAuthorizedGuilds],
  fallbackApis: [],
  autoBypassChannels: [],
  settings: { schemaVersion: 1 },
});

export async function initializeStorage(): Promise<void> {
  if (databaseEnabled) await initializeDatabase();
}

export async function loadConfig(): Promise<PersistedConfig> {
  if (databaseEnabled) return loadDatabaseConfig();
  try {
    const raw = JSON.parse(await readFile(config.dataFile, 'utf8')) as Partial<PersistedConfig>;
    return {
      authorizedGuildIds: [...new Set(raw.authorizedGuildIds ?? defaults().authorizedGuildIds)],
      fallbackApis: Array.isArray(raw.fallbackApis) ? raw.fallbackApis.filter(validApi) : [],
      autoBypassChannels: Array.isArray(raw.autoBypassChannels) ? raw.autoBypassChannels : [],
      settings: raw.settings ?? { schemaVersion: 1 },
    };
  } catch {
    let fallbackApis: FallbackApi[] = [];
    try { fallbackApis = JSON.parse(config.fallbackApisJson) as FallbackApi[]; } catch { /* use empty */ }
    const initial = { ...defaults(), fallbackApis: fallbackApis.filter(validApi) };
    await saveConfig(initial);
    return initial;
  }
}

export async function saveConfig(value: PersistedConfig): Promise<void> {
  if (databaseEnabled) { await saveDatabaseConfig(value); return; }
  await mkdir(dirname(config.dataFile.pathname), { recursive: true });
  await writeFile(config.dataFile, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function validApi(value: unknown): value is FallbackApi {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FallbackApi>;
  try { new URL(item.endpoint ?? ''); } catch { return false; }
  return typeof item.name === 'string' && item.name.length > 0 &&
    typeof item.endpoint === 'string' && /^https?:$/i.test(new URL(item.endpoint).protocol) &&
    (item.authEnv === undefined || typeof item.authEnv === 'string');
}
