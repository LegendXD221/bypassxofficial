import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { bypass, providerHealthSnapshot } from './services/bypass.js';
import type { BypassResult } from './types.js';

const apiPort = Number(process.env.API_PORT ?? 8787);
const apiKeys = new Set((process.env.API_KEYS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const anonymousAllowed = process.env.API_ALLOW_ANONYMOUS === 'true';
const cacheTtlMs = Math.max(0, Number(process.env.API_CACHE_TTL_SECONDS ?? 300)) * 1_000;
const maxBodyBytes = 32 * 1024;
const cache = new Map<string, { expiresAt: number; result: BypassResult }>();
const inflight = new Map<string, Promise<BypassResult>>();
const startedAt = Date.now();

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

function authenticate(req: IncomingMessage): boolean {
  const key = requestKey(req);
  return Boolean((key && apiKeys.has(key)) || (anonymousAllowed && apiKeys.size === 0));
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

function safeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === 'metadata.google.internal' || host === 'instance-data') return false;
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const octets = host.split('.').map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (ipVersion === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb'))) return false;
  return true;
}

function normalizedTarget(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return undefined;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !safeHostname(url.hostname)) return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

async function targetFromRequest(req: IncomingMessage, url: URL): Promise<string | undefined> {
  if (req.method === 'GET') return normalizedTarget(url.searchParams.get('url'));
  const raw = await readBody(req);
  if (!raw) return undefined;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON'); }
  return normalizedTarget(body && typeof body === 'object' ? (body as { url?: unknown }).url : undefined);
}

function cleanCache(): void {
  const now = Date.now();
  for (const [key, value] of cache) if (value.expiresAt <= now) cache.delete(key);
}

async function resolve(target: string): Promise<{ result: BypassResult; cached: boolean }> {
  cleanCache();
  const hit = cache.get(target);
  if (hit) return { result: hit.result, cached: true };

  const existing = inflight.get(target);
  if (existing) return { result: await existing, cached: false };

  const promise = bypass(target, []);
  inflight.set(target, promise);
  try {
    const result = await promise;
    if (result.ok && result.destination && cacheTtlMs > 0) cache.set(target, { expiresAt: Date.now() + cacheTtlMs, result });
    return { result, cached: false };
  } finally {
    inflight.delete(target);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname === '/health' && req.method === 'GET') {
      json(res, 200, { service: 'BypassX API', status: 'ok', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1_000), cacheEntries: cache.size, inflight: inflight.size, date: today() });
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
    if (!authenticate(req)) {
      json(res, 401, { ok: false, error: 'Missing or invalid API key' });
      return;
    }

    const target = await targetFromRequest(req, url);
    if (!target) {
      json(res, 400, { ok: false, error: 'Provide a valid public HTTP(S) URL in the url field' });
      return;
    }

    const { result, cached } = await resolve(target);
    if (!result.ok) {
      json(res, 502, { ok: false, error: 'All free providers failed', details: result.error, cached });
      return;
    }

    json(res, result.destination ? 200 : 202, {
      ok: true,
      destination: result.destination,
      provider: result.provider,
      service: result.service,
      pending: result.pending,
      jobId: result.jobId,
      pollUrl: result.pollUrl,
      captchaUrl: result.captchaUrl,
      wsUrl: result.wsUrl,
      durationMs: result.ms,
      cached,
    });
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Bad request' });
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.listen(apiPort, '0.0.0.0', () => {
  console.log(`BypassX API listening on 0.0.0.0:${apiPort}`);
  console.log(`Authentication: ${apiKeys.size ? 'API key required' : anonymousAllowed ? 'anonymous development mode' : 'API key required but none configured'}`);
  console.log(`Provider mode: free-only (Alysse, UseBypass, OmegaTech); cache TTL: ${cacheTtlMs / 1_000}s`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
