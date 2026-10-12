import 'dotenv/config';

function csv(name: string): string[] {
  return (process.env[name] ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

export const config = {
  token: process.env.BOT_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  port: Number(process.env.PORT ?? 10000),
  guildId: process.env.DISCORD_GUILD_ID,
  owners: new Set(csv('OWNER_USER_IDS')),
  databaseUrl: process.env.DATABASE_URL,
  defaultAuthorizedGuilds: csv('DEFAULT_AUTHORIZED_GUILD_IDS'),
  autoBypassCooldownSeconds: Number(process.env.AUTO_BYPASS_COOLDOWN_SECONDS ?? 15),
  autoBypassMaxUrlsPerMessage: Number(process.env.AUTO_BYPASS_MAX_URLS_PER_MESSAGE ?? 1),
  alysseApiUrl: process.env.ALYSSE_API_URL ?? 'https://alysse.top/api/bypass',
  useBypassApiUrl: process.env.USEBYPASS_API_URL ?? 'https://usebypass.com/api/v1/bypass',
  useBypassToken: process.env.USEBYPASS_API_TOKEN,
  omegaTechApiUrl: process.env.OMEGATECH_API_URL ?? 'https://api.omegatech.app/api/tools/All-bypass',
  fallbackApisJson: process.env.BYPASSX_FALLBACK_APIS ?? '[]',
  dataFile: new URL('../data/config.json', import.meta.url),
};

export function assertConfig(): void {
  const missing = ['BOT_TOKEN', 'CLIENT_ID'].filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}
