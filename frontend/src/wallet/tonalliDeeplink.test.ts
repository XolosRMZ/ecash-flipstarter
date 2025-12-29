import { describe, expect, it } from 'vitest';
import { buildTonalliExternalSignUrl } from './tonalliDeeplink';

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getRequestParam(url: string): string {
  const parsed = new URL(url);
  const fragment = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const query = fragment.includes('?') ? fragment.split('?')[1] : parsed.search.slice(1);
  const requestParam = new URLSearchParams(query).get('request');
  if (!requestParam) {
    throw new Error('Missing request param');
  }
  return requestParam;
}

describe('buildTonalliExternalSignUrl', () => {
  it('includes the canonical request type', () => {
    (import.meta as any).env = { VITE_TONALLI_BASE_URL: 'http://localhost:5174' };
    const url = buildTonalliExternalSignUrl({ unsignedTxHex: 'deadbeef' });
    const requestParam = getRequestParam(url);
    const payload = JSON.parse(decodeBase64Url(decodeURIComponent(requestParam)));

    expect(payload.type).toBe('TONALLI_SIGN_REQUEST');
  });

  it('uses url-safe base64 encoding', () => {
    (import.meta as any).env = { VITE_TONALLI_BASE_URL: 'http://localhost:5174' };
    const url = buildTonalliExternalSignUrl({ unsignedTxHex: 'deadbeef' });
    const requestParam = getRequestParam(url);
    const decoded = decodeURIComponent(requestParam);

    expect(decoded).not.toContain('+');
    expect(decoded).not.toContain('/');
    expect(decoded).not.toContain('=');
  });
});
