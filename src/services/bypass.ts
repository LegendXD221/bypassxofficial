import { config } from '../config.js';
import type { BypassResult, FallbackApi } from '../types.js';

const timeoutMs = 12_000;
type Provider = FallbackApi & { name: string; endpoint: string; adapter?: FallbackApi['adapter'] };

type Json = Record<string, unknown>;

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractDestination(body: Json): string | undefined {
  return stringValue(body.destination) ?? stringValue(body.url) ?? stringValue(body.link) ??
    (body.result && typeof body.result === 'object' ? extractDestination(body.result as Json) : undefined) ??
    (body.data && typeof body.data === 'object' ? extractDestination(body.data as Json) : undefined);
}

async function callProvider(provider: Provider, target: string): Promise<BypassResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
    let endpoint = provider.endpoint;
    let body: string | undefined;
    const method = provider.method ?? (provider.adapter === 'usebypass' ? 'GET' : 'POST');

    if (provider.adapter === 'usebypass') {
      endpoint = `${provider.endpoint}?url=${encodeURIComponent(target)}`;
      if (config.useBypassToken) headers.authorization = `Token ${config.useBypassToken}`;
    } else if (provider.authEnv && process.env[provider.authEnv]) {
      headers.authorization = `Bearer ${process.env[provider.authEnv]}`;
    }
    if (method === 'POST') body = JSON.stringify({ url: target });

    const response = await fetch(endpoint, { method, headers, body, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as Json;
    const destination = extractDestination(payload);
    const status = stringValue(payload.status)?.toUpperCase();
    const pending = status && ['PENDING', 'QUEUED', 'RESOLVING'].includes(status);
    if (!response.ok || payload.ok === false || payload.success === false || ['FAILED', 'BLOCKED', 'NOT_FOUND'].includes(status ?? '')) {
      throw new Error(stringValue(payload.error) ?? stringValue(payload.message) ?? `HTTP ${response.status}`);
    }
    if (!destination && !pending) throw new Error('Provider returned no destination');
    return {
      ok: true,
      provider: provider.name,
      destination,
      service: stringValue(payload.service),
      pending: pending ? (status ?? 'PENDING') : stringValue(payload.pending),
      captchaUrl: stringValue(payload.captchaUrl),
      wsUrl: stringValue(payload.wsUrl),
      ms: typeof payload.ms === 'number' ? payload.ms : undefined,
    };
  } finally { clearTimeout(timer); }
}

export async function bypass(target: string, fallbacks: FallbackApi[]): Promise<BypassResult> {
  const providers: Provider[] = [
    { name: 'Alysse', endpoint: config.alysseApiUrl, method: 'POST', adapter: 'generic' },
    { name: 'UseBypass', endpoint: config.useBypassApiUrl, method: 'GET', adapter: 'usebypass' },
    { name: 'OmegaTech', endpoint: config.omegaTechApiUrl, method: 'POST', adapter: 'omegatech' },
    ...fallbacks,
  ];
  const errors: string[] = [];
  for (const provider of providers) {
    try { return await callProvider(provider, target); }
    catch (error) { errors.push(`${provider.name}: ${error instanceof Error ? error.message : 'failed'}`); }
  }
  return { ok: false, provider: 'none', error: errors.join('\n') || 'No providers configured' };
}
