# BypassX Discord Bot

A production-oriented TypeScript Discord bot built around the Alysse API, with **Neon Postgres persistence**, Discord **Components V2**, owner-only administration, automatic URL bypass channels, provider failover, and command auto-loading.

## What is included

- `/bypass url:<url>` calls **Alysse → UseBypass → OmegaTech → custom providers**.
- Components V2 result panels and destination buttons.
- Neon tables for authorized guilds, providers, auto-bypass channels, bot settings, and audit logs.
- `/server authorize|deauthorize|status` for owner-controlled guild access.
- `/autobypass enable|disable|list` for owner-controlled message URL monitoring.
- Automatic URL detection in configured text channels with per-user cooldown protection.
- Auto-bypass posts `<@user> bypassing your link...`, edits that same bot message into the result, and can delete only that user's source/result pair after 30 seconds.
- `/api add|remove|list` for custom fallback providers.
- `/owner stats|health` for the owner dashboard.
- `/status` for live gateway latency, storage, provider, uptime, and auto-bypass information.
- Rotating Discord presence with configurable messages and interval.
- Commands are auto-loaded from `src/commands`; add a new command file and redeploy.
- Slash commands are synchronized automatically on bot startup, so new commands replace stale registrations.
- Local JSON fallback is retained for development when `DATABASE_URL` is not set.

## Discord setup

1. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable the **Message Content Intent** under Bot settings. This is required for automatic URL detection.
3. Invite the bot with the `bot` and `applications.commands` scopes. It needs `View Channel`, `Send Messages`, and `Use Application Commands`; add `Manage Messages` if paired auto-bypass cleanup is enabled.
4. Copy `.env.example` to `.env` and fill in `BOT_TOKEN`, `CLIENT_ID`, `OWNER_USER_IDS`, and `DATABASE_URL`.

## Neon setup

Create a free Postgres project at [Neon](https://neon.tech), copy its pooled connection string, and put it in `.env`:

```env
DATABASE_URL=postgresql://user:password@ep-example.region.aws.neon.tech/neondb?sslmode=require
```

On startup BypassX creates or updates these tables automatically:

| Table | Purpose |
|---|---|
| `guild_settings` | Authorized guild allowlist |
| `bypass_providers` | Custom provider endpoints and adapter metadata |
| `auto_bypass_channels` | Channels where URLs are resolved automatically |
| `bot_settings` | Persistent bot settings |
| `audit_logs` | Owner commands and auto-bypass activity |

The equivalent SQL is also available in `db/schema.sql`.

## Run

```bash
npm install
cp .env.example .env
# Fill in the environment variables
npm run deploy
npm run build
npm start
```

## Standalone REST API

The API can run independently from Discord. It uses the same provider adapters but does not start a Discord client or require `BOT_TOKEN` or `CLIENT_ID`.

```bash
npm run build
npm run start:api
```

Endpoints:

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | None | Liveness check |
| `GET` | `/v1/providers` | None | Provider cooldown status |
| `GET` | `/v1/bypass?url=https://example.com` | API key | Resolve a URL |
| `POST` | `/v1/bypass` | API key | Resolve `{ "url": "https://example.com" }` |

Use either `Authorization: Bearer <API_KEYS value>` or `x-api-key: <API_KEYS value>`. The standalone service uses only the free Alysse, UseBypass, and OmegaTech providers and has no paid-provider quota. Successful destinations are cached for `API_CACHE_TTL_SECONDS` (default 300 seconds), simultaneous requests for the same normalized URL share one provider request, and UseBypass pending jobs are polled automatically. Localhost, private-network, and cloud-metadata URLs are rejected. Keep `API_ALLOW_ANONYMOUS=false` in production.

Example:

```bash
curl -X POST http://localhost:8787/v1/bypass \
  -H 'content-type: application/json' \
  -H 'x-api-key: change-me-to-a-long-random-key' \
  -d '{"url":"https://example.com"}'
```

Use `npm run dev` during development after slash commands have been deployed. Set `DISCORD_GUILD_ID` to deploy commands to one guild immediately; omit it for global command registration.

## Render deployment and UptimeRobot

BypassX includes a small HTTP server in the same process as the Discord bot. It binds to `0.0.0.0:$PORT` for Render and exposes:

| Endpoint | Purpose |
|---|---|
| `/health` | Always returns HTTP 200 while the process is alive; use this for Render and UptimeRobot |
| `/ready` | Returns HTTP 200 only after the Discord gateway is ready |
| `/metrics` | Lightweight Prometheus-style process metrics |

### Deploy with Render Blueprint

1. Push this project to a private or public GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository.
3. Render detects `render.yaml` and creates a Node web service named `bypassx`.
4. Add the secret values when Render asks for them: `BOT_TOKEN`, `CLIENT_ID`, `DATABASE_URL`, `OWNER_USER_IDS`, and optionally `USEBYPASS_API_TOKEN`.
5. Enable **Message Content Intent** in Discord before using auto-bypass.

The service is configured with `npm ci && npm run build`, `npm start`, and Render health checks against `/health`. Render supplies `PORT` automatically; do not hard-code it.

### Slash-command synchronization

The bot now synchronizes its current command list on every startup. For fast development updates, set:

```env
DISCORD_GUILD_ID=YOUR_TEST_SERVER_ID
AUTO_SYNC_COMMANDS=true
CLEAR_GLOBAL_COMMANDS=true
```

When `DISCORD_GUILD_ID` is set, commands appear in that guild quickly and old global registrations are cleared. Without a guild ID, commands are registered globally and Discord may take up to an hour to propagate changes. You can also manually run:

```bash
npm run deploy
```

If old commands still appear after a Render deploy, confirm that `CLIENT_ID` belongs to the same Discord application as `BOT_TOKEN`, set `DISCORD_GUILD_ID` to the server being tested, redeploy, and restart the service.

### Add UptimeRobot

After Render gives the service a URL, create an UptimeRobot **HTTP(s)** monitor with:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

Use a 5-minute interval and expect HTTP status `200`. The JSON response includes `service: "BypassX"`, `status`, `discordReady`, and basic runtime counts. If you want alerts only when Discord is connected, monitor `/ready` instead; it returns `503` during startup.

UptimeRobot does not need a BypassX token or Discord credentials. Never put `BOT_TOKEN` or `DATABASE_URL` in a monitor URL.

## Owner-only workflow

Set one or more trusted Discord user IDs:

```env
OWNER_USER_IDS=123456789012345678,987654321098765432
```

Then, inside a server:

```text
/server authorize
/autobypass enable channel:#links
/autobypass enable channel:#links delete_after_30s:true
```

Users can now use `/bypass` in that authorized server, and links posted in the configured channel are handled automatically. To turn it off:

```text
/autobypass disable channel:#links
/server deauthorize
```

When auto-bypass is enabled, BypassX posts **AutoBypass Enabled — Paste Links To Bypass Them** in that channel. Cleanup is off by default and can be toggled per channel:

```text
/autobypass cleanup channel:#links enabled:true
/autobypass cleanup channel:#links enabled:false
```

When enabled, only the triggering user's link message and the paired BypassX progress/result message are deleted. Messages from other users are never deleted by this cleanup. The delay defaults to 30 seconds and is controlled by `AUTO_BYPASS_DELETE_AFTER_SECONDS`.

Owner-only commands are `/server`, `/api`, `/autobypass`, and `/owner`.

`/status` is available in authorized guilds and shows the live bot state. The presence rotator changes the bot activity every 90 seconds by default. Customize it in Render or `.env`:

```env
STATUS_ROTATOR_INTERVAL_SECONDS=90
STATUS_ROTATOR_MESSAGES=Use /bypass to resolve links,{guilds} authorized guilds,{providers} providers online
```

Supported placeholders are `{guilds}`, `{channels}`, and `{providers}`. The interval is clamped to at least 30 seconds to avoid Discord presence spam.

## Built-in providers

The fallback chain is:

1. `ALYSSE_API_URL` — default `https://alysse.top/api/bypass`, JSON POST `{ "url": "..." }`.
2. `USEBYPASS_API_URL` — default `https://usebypass.com/api/v1/bypass`, GET `?url=...`. Optional `USEBYPASS_API_TOKEN` is sent as `Authorization: Token ...`.
3. `OMEGATECH_API_URL` — default `https://api.omegatech.app/api/tools/all-bypass`. BypassX supports both JSON POST and GitHub-documented GET `?url=...` compatibility.
4. Custom providers stored in Neon.

Override endpoint URLs through environment variables if a provider changes its route. Provider failures are retried for transient errors, providers are temporarily cooled down after repeated failures, and the next provider is attempted automatically. Successful destinations are normalized across provider response shapes such as `destination`, `resultUrl`, `result`, `data`, and `link`.

## Custom fallback providers

A custom endpoint must accept a JSON `POST` body like `{ "url": "https://..." }` and return JSON containing a destination URL, such as `{ "destination": "https://..." }`. Add one as an owner:

```text
/api add name:"My API" endpoint:"https://api.example.com/bypass" auth_env:"MY_API_TOKEN"
```

If `auth_env` is provided, BypassX sends `Authorization: Bearer <value of that environment variable>`. Secrets are never written to Neon; only the environment-variable name is stored.

## Adding commands

Create `src/commands/my-command.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { panel, publicV2Flags } from '../utils/components.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('my-command').setDescription('My command'),
  async execute(interaction) {
    await interaction.reply({ components: [panel('My command', 'Hello from a new feature.')], flags: publicV2Flags });
  },
};
export default command;
```

Run `npm run deploy` after adding or changing commands.

## Security and operations

- Never commit `.env` or `data/config.json`.
- Keep `OWNER_USER_IDS` limited to trusted administrators.
- Configure only fallback URLs you control or trust; providers receive submitted URLs.
- Auto-bypass is rate-limited per user/channel by `AUTO_BYPASS_COOLDOWN_SECONDS`.
- This project validates HTTP(S) input but does not attempt to bypass Discord, provider, or website security controls.
