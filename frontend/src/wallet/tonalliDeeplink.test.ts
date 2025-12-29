import { describe, expect, it } from 'vitest';
import { buildTonalliExternalSignUrl } from './tonalliDeeplink';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  it('includes the canonical request payload with a requestId', () => {
    const unsignedTxHex = 'deadbeef';
    const url = buildTonalliExternalSignUrl({
      unsignedTxHex,
      env: { VITE_TONALLI_BASE_URL: 'http://localhost:5174' },
    });
    const requestParam = getRequestParam(url);
    const payload = JSON.parse(decodeBase64Url(decodeURIComponent(requestParam)));

    expect(payload.kind).toBe('TONALLI_SIGN_REQUEST');
    expect(payload.type).toBe('TONALLI_SIGN_REQUEST');
    expect(payload.requestId).toMatch(UUID_V4_REGEX);
    expect(payload.unsignedTxHex).toBe(unsignedTxHex);
  });

  it('uses url-safe base64 encoding', () => {
    const url = buildTonalliExternalSignUrl({
      unsignedTxHex: 'deadbeef',
      env: { VITE_TONALLI_BASE_URL: 'http://localhost:5174' },
    });
    const requestParam = getRequestParam(url);
    const decoded = decodeURIComponent(requestParam);

    expect(decoded).not.toContain('+');
    expect(decoded).not.toContain('/');
    expect(decoded).not.toContain('=');
  });

  it('preserves the base URL from env without rewriting', () => {
    const url = buildTonalliExternalSignUrl({
      unsignedTxHex: 'deadbeef',
      env: { VITE_TONALLI_BASE_URL: 'http://127.0.0.1:5174' },
    });

    expect(url.startsWith('http://127.0.0.1:5174')).toBe(true);
  });

  it('respects the bridge path override', () => {
    const url = buildTonalliExternalSignUrl({
      unsignedTxHex: 'deadbeef',
      env: {
        VITE_TONALLI_BASE_URL: 'http://localhost:5174',
        VITE_TONALLI_BRIDGE_PATH: '/custom-bridge',
      },
    });

    expect(url.startsWith('http://localhost:5174/custom-bridge?request=')).toBe(true);
  });

  it('round-trips unsignedTxHex through encode/decode', () => {
    const unsignedTxHex = '010203deadbeef';
    const url = buildTonalliExternalSignUrl({
      unsignedTxHex,
      env: { VITE_TONALLI_BASE_URL: 'http://localhost:5174' },
    });
    const requestParam = getRequestParam(url);
    const payload = JSON.parse(decodeBase64Url(decodeURIComponent(requestParam)));

    expect(payload.unsignedTxHex).toBe(unsignedTxHex);
  });
});
