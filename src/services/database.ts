import { neon } from '@neondatabase/serverless';
import { config } from '../config.js';
import type { AutoBypassChannel, FallbackApi, PersistedConfig } from '../types.js';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, authorized BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bypass_providers (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, endpoint TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST')), adapter TEXT NOT NULL DEFAULT 'generic', auth_env TEXT, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS auto_bypass_channels (guild_id TEXT NOT NULL REFERENCES guild_settings(guild_id) ON DELETE CASCADE, channel_id TEXT PRIMARY KEY, delete_source BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS bot_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, guild_id TEXT, user_id TEXT NOT NULL, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS audit_logs_guild_id_idx ON audit_logs (guild_id)`,
];

const sql = config.databaseUrl ? neon(config.databaseUrl) : null;
export const databaseEnabled = Boolean(sql);

const defaults = (): PersistedConfig => ({
  authorizedGuildIds: [...config.defaultAuthorizedGuilds],
  fallbackApis: [],
  autoBypassChannels: [],
  settings: { schemaVersion: 1 },
});

export async function initializeDatabase(): Promise<void> {
  if (!sql) return;
  for (const statement of schemaStatements) await sql.query(statement);
  const initial = defaults();
  for (const guildId of initial.authorizedGuildIds) {
    await sql`INSERT INTO guild_settings (guild_id, authorized) VALUES (${guildId}, TRUE) ON CONFLICT (guild_id) DO UPDATE SET authorized = TRUE, updated_at = NOW()`;
  }
}

export async function loadDatabaseConfig(): Promise<PersistedConfig> {
  if (!sql) throw new Error('Neon is not configured');
  const guildRows = await sql`SELECT guild_id FROM guild_settings WHERE authorized = TRUE ORDER BY guild_id` as Array<{ guild_id: string }>;
  const providerRows = await sql`SELECT name, endpoint, method, adapter, auth_env FROM bypass_providers WHERE enabled = TRUE ORDER BY id` as Array<{ name: string; endpoint: string; method: 'GET' | 'POST'; adapter: FallbackApi['adapter']; auth_env?: string }>;
  const channelRows = await sql`SELECT guild_id, channel_id, delete_source FROM auto_bypass_channels ORDER BY created_at` as Array<{ guild_id: string; channel_id: string; delete_source: boolean }>;
  const settingRows = await sql`SELECT key, value FROM bot_settings` as Array<{ key: string; value: unknown }>;
  return {
    authorizedGuildIds: guildRows.map((row) => row.guild_id),
    fallbackApis: providerRows.map((row) => ({ name: row.name, endpoint: row.endpoint, method: row.method, adapter: row.adapter, authEnv: row.auth_env })),
    autoBypassChannels: channelRows.map((row) => ({ guildId: row.guild_id, channelId: row.channel_id, deleteSource: row.delete_source })),
    settings: Object.fromEntries(settingRows.map((row) => [row.key, row.value])),
  };
}

export async function saveDatabaseConfig(value: PersistedConfig): Promise<void> {
  if (!sql) throw new Error('Neon is not configured');
  await sql`DELETE FROM auto_bypass_channels`;
  await sql`DELETE FROM bypass_providers`;
  await sql`DELETE FROM guild_settings`;
  for (const guildId of [...new Set(value.authorizedGuildIds)]) {
    await sql`INSERT INTO guild_settings (guild_id, authorized) VALUES (${guildId}, TRUE)`;
  }
  for (const provider of value.fallbackApis) {
    await sql`INSERT INTO bypass_providers (name, endpoint, method, adapter, auth_env) VALUES (${provider.name}, ${provider.endpoint}, ${provider.method ?? 'POST'}, ${provider.adapter ?? 'generic'}, ${provider.authEnv ?? null})`;
  }
  for (const channel of value.autoBypassChannels) {
    if (value.authorizedGuildIds.includes(channel.guildId)) {
      await sql`INSERT INTO auto_bypass_channels (guild_id, channel_id, delete_source) VALUES (${channel.guildId}, ${channel.channelId}, ${channel.deleteSource})`;
    }
  }
  for (const [key, setting] of Object.entries(value.settings)) {
    await sql`INSERT INTO bot_settings (key, value) VALUES (${key}, ${JSON.stringify(setting)}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  }
}

export async function audit(action: string, userId: string, guildId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
  if (!sql) return;
  await sql`INSERT INTO audit_logs (guild_id, user_id, action, metadata) VALUES (${guildId}, ${userId}, ${action}, ${JSON.stringify(metadata)}::jsonb)`;
}

export async function databaseStats(): Promise<{ guilds: number; providers: number; channels: number; audits: number }> {
  if (!sql) return { guilds: 0, providers: 0, channels: 0, audits: 0 };
  const rows = await sql`SELECT
    (SELECT COUNT(*)::int FROM guild_settings WHERE authorized = TRUE) AS guilds,
    (SELECT COUNT(*)::int FROM bypass_providers WHERE enabled = TRUE) AS providers,
    (SELECT COUNT(*)::int FROM auto_bypass_channels) AS channels,
    (SELECT COUNT(*)::int FROM audit_logs) AS audits` as Array<{ guilds: number; providers: number; channels: number; audits: number }>;
  return rows[0] ?? { guilds: 0, providers: 0, channels: 0, audits: 0 };
}

export type { AutoBypassChannel };
