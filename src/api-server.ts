import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from './config.js';
import { bypass, providerHealthSnapshot } from './services/bypass.js';

const apiPort = Number(process.env.API_PORT ?? 8787);
const dailyQuota = Math.max(1, Number(process.env.API_DAILY_QUOTA ?? 100));
const apiKeys = new Set((process.env.API_KEYS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const anonymousAllowed = process.env.API_ALLOW_ANONYMOUS === 'true';
const usage = new Map<string, { day: string; count: number }>();
const maxBodyBytes = 32 * 1024;

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function requestKey(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || undefined;
  const key = req.headers['x-api-key'];
  return typeof key === 'string' ? key.trim() || undefined : undefined;
}

function authenticate(req: IncomingMessage): string | undefined {
  const key = requestKey(req);
  if (key && apiKeys.has(key)) return key;
  if (anonymousAllowed && apiKeys.size === 0) return 'anonymous';
  return undefined;
}

function quotaRemaining(key: string): number {
  const current = usage.get(key);
  if (!current || current.day !== today()) return dailyQuota;
  return Math.max(0, dailyQuota - current.count);
}

function consume(key: string): number {
  const day = today();
  const current = usage.get(key);
  const next = !current || current.day !== day ? { day, count: 1 } : { day, count: current.count + 1 };
  usage.set(key, next);
  return Math.max(0, dailyQuota - next.count);
}

async function readBody(req: IncomingMessage): Promise<string> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += data.length;
    if (total > maxBodyBytes) throw new Error('Request body is too large');
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function validTarget(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function targetFromRequest(req: IncomingMessage, url: URL): Promise<string | undefined> {
  if (req.method === 'GET') return url.searchParams.get('url') ?? undefined;
  const raw = await readBody(req);
  if (!raw) return undefined;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON'); }
  return body && typeof body === 'object' ? (body as { url?: unknown }).url as string | undefined : undefined;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/health' && req.method === 'GET') {
      json(res, 200, { service: 'BypassX API', status: 'ok', date: today() });
      return;
    }

    if (url.pathname === '/v1/providers' && req.method === 'GET') {
      json(res, 200, { providers: providerHealthSnapshot() });
      return;
    }

    if (url.pathname !== '/v1/bypass' || !['GET', 'POST'].includes(req.method ?? '')) {
      json(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    const key = authenticate(req);
    if (!key) {
      json(res, 401, { ok: false, error: 'Missing or invalid API key' });
      return;
    }
    const remainingBefore = quotaRemaining(key);
    if (remainingBefore <= 0) {
      json(res, 429, { ok: false, error: 'Daily quota exceeded', quota: { limit: dailyQuota, remaining: 0, reset: 'UTC midnight' } });
      return;
    }

    const target = await targetFromRequest(req, url);
    if (!validTarget(target)) {
      json(res, 400, { ok: false, error: 'Provide a valid HTTP(S) URL in the url field' });
      return;
    }

    const remaining = consume(key);
    const result = await bypass(target, []);
    if (!result.ok) {
      json(res, 502, { ok: false, error: 'All providers failed', details: result.error, quota: { limit: dailyQuota, remaining, reset: 'UTC midnight' } });
      return;
    }

    json(res, result.destination ? 200 : 202, {
      ok: true,
      destination: result.destination,
      provider: result.provider,
      service: result.service,
      pending: result.pending,
      durationMs: result.ms,
      quota: { limit: dailyQuota, remaining, reset: 'UTC midnight' },
    });
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Bad request' });
  }
});

server.listen(apiPort, '0.0.0.0', () => {
  console.log(`BypassX API listening on 0.0.0.0:${apiPort}`);
  console.log(`Authentication: ${apiKeys.size ? 'API key required' : anonymousAllowed ? 'anonymous development mode' : 'API key required but none configured'}`);
  console.log(`Daily quota: ${dailyQuota}`);
});
