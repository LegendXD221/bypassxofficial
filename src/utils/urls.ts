import { isIP } from 'node:net';

function safeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === 'metadata.google.internal' || host === 'instance-data') return false;
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (version === 6 && (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || /^fe[89ab]/.test(host))) return false;
  return true;
}

export function parsePublicUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(parsed.protocol) || !safeHostname(parsed.hostname)) return undefined;
    parsed.hash = '';
    return parsed;
  } catch {
    return undefined;
  }
}
