import { config } from '../config.js';
import type { BypassResult, FallbackApi } from '../types.js';

type Json = Record<string, unknown>;
type Provider = FallbackApi & { name: string; endpoint: string; adapter?: FallbackApi['adapter'] };

type ProviderError = Error & { status?: number; retryable?: boolean };

type Health = { failures: number; cooldownUntil: number };

const timeoutMs = 12_000;
const retryDelayMs = 350;
const health = new Map<string, Health>();

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function errorWithStatus(message: string, status?: number): ProviderError {
  const error = new Error(message) as ProviderError;
  error.status = status;
  error.retryable = status === undefined || [408, 425, 429, 500, 502, 503, 504].includes(status);
  return error;
}

function extractDestination(value: unknown, target: string, depth = 0): string | undefined {
  if (depth > 5) return undefined;
  if (typeof value === 'string') {
    const candidate = value.trim();
    if (/^https?:\/\//i.test(candidate) && candidate !== target) return candidate;
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Json)) {
    if (['destination', 'resultUrl', 'finalUrl', 'redirect', 'link', 'url', 'result', 'data', 'response'].includes(key)) {
      const found = extractDestination(child, target, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function providerMethod(provider: Provider): 'GET' | 'POST' {
  if (provider.method) return provider.method;
  if (provider.adapter === 'usebypass') return 'GET';
  return 'POST';
}

function endpointWithUrl(endpoint: string, target: string): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}url=${encodeURIComponent(target)}`;
}

async function callProviderOnce(provider: Provider, target: string, method: 'GET' | 'POST'): Promise<BypassResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    let endpoint = provider.endpoint;
    let body: string | undefined;

    if (method === 'GET') {
      endpoint = endpointWithUrl(endpoint, target);
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify({ url: target });
    }

    if (provider.adapter === 'usebypass' && config.useBypassToken) {
      headers.authorization = `Token ${config.useBypassToken}`;
    } else if (provider.authEnv && process.env[provider.authEnv]) {
      headers.authorization = `Bearer ${process.env[provider.authEnv]}`;
    }

    const response = await fetch(endpoint, { method, headers, body, signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as Json;
    const status = stringValue(payload.status)?.toUpperCase();
    const pending = Boolean(status && ['PENDING', 'QUEUED', 'PROCESSING', 'RESOLVING'].includes(status));
    const failed = ['FAILED', 'ERROR', 'BLOCKED', 'NOT_FOUND'].includes(status ?? '');

    if (!response.ok || payload.ok === false || payload.success === false || failed) {
      throw errorWithStatus(stringValue(payload.error) ?? stringValue(payload.message) ?? `HTTP ${response.status}`, response.status);
    }

    const destination = extractDestination(payload, target);
    if (!destination && !pending) throw errorWithStatus('Provider returned no destination');

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
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw errorWithStatus(`Timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function alternateMethods(provider: Provider): ('GET' | 'POST')[] {
  const primary = providerMethod(provider);
  // GitHub integrations show OmegaTech working as GET with data.result; keep POST first for compatibility and retry via GET.
  if (provider.adapter === 'omegatech') return primary === 'GET' ? ['GET', 'POST'] : ['POST', 'GET'];
  return [primary];
}

async function callProvider(provider: Provider, target: string): Promise<BypassResult> {
  let lastError: unknown;
  for (const method of alternateMethods(provider)) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await callProviderOnce(provider, target, method);
      } catch (error) {
        lastError = error;
        const typed = error as ProviderError;
        if (!typed.retryable || attempt === 1) break;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Provider request failed');
}

function isCoolingDown(name: string): boolean {
  return (health.get(name)?.cooldownUntil ?? 0) > Date.now();
}

function markSuccess(name: string): void {
  health.delete(name);
}

function markFailure(name: string): void {
  const previous = health.get(name) ?? { failures: 0, cooldownUntil: 0 };
  const failures = previous.failures + 1;
  const cooldownMs = Math.min(60_000, 2 ** Math.min(failures, 5) * 1_000);
  health.set(name, { failures, cooldownUntil: Date.now() + cooldownMs });
}

function builtInProviders(): Provider[] {
  return [
    { name: 'Alysse', endpoint: config.alysseApiUrl, method: 'POST', adapter: 'generic' },
    { name: 'UseBypass', endpoint: config.useBypassApiUrl, method: 'GET', adapter: 'usebypass' },
    { name: 'OmegaTech', endpoint: config.omegaTechApiUrl, method: 'POST', adapter: 'omegatech' },
  ];
}

export function providerHealthSnapshot(): Array<{ provider: string; failures: number; cooldownUntil?: number }> {
  return [...health.entries()].map(([provider, value]) => ({
    provider,
    failures: value.failures,
    cooldownUntil: value.cooldownUntil > Date.now() ? value.cooldownUntil : undefined,
  }));
}

export async function bypass(target: string, fallbacks: FallbackApi[]): Promise<BypassResult> {
  const providers = [...builtInProviders(), ...fallbacks] as Provider[];
  const errors: string[] = [];
  for (const provider of providers) {
    if (isCoolingDown(provider.name)) {
      errors.push(`${provider.name}: temporarily cooling down`);
      continue;
    }
    try {
      const result = await callProvider(provider, target);
      markSuccess(provider.name);
      return result;
    } catch (error) {
      markFailure(provider.name);
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  return { ok: false, provider: 'none', error: errors.join('\n') || 'No providers configured' };
}
