type TonalliBridgeEnv = {
  VITE_TONALLI_BRIDGE_URL?: string;
  VITE_TONALLI_BASE_URL?: string;
  VITE_TONALLI_BRIDGE_ORIGIN?: string;
};

type TonalliBridgeOptions = {
  env?: TonalliBridgeEnv;
  hostname?: string;
};

export type TonalliBridgeConfig = {
  baseUrl: string;
  origin: string;
};

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5174';
const LOCAL_BRIDGE_PORT = '5174';

let logged = false;

function getEnv(): TonalliBridgeEnv {
  return (import.meta as any).env || {};
}

function isDevEnv(env?: TonalliBridgeEnv): boolean {
  const meta = env as { DEV?: boolean; MODE?: string } | undefined;
  if (meta?.DEV !== undefined) {
    return Boolean(meta.DEV);
  }
  if (meta?.MODE) {
    return meta.MODE !== 'production';
  }
  return false;
}

function normalizeUrl(value?: string): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function resolveHostname(options?: TonalliBridgeOptions): string {
  if (options?.hostname) return options.hostname;
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
}

function resolveLocalBaseUrl(hostname: string): string {
  if (hostname === 'localhost') {
    return `http://localhost:${LOCAL_BRIDGE_PORT}`;
  }
  return `http://127.0.0.1:${LOCAL_BRIDGE_PORT}`;
}

export function resolveTonalliBridgeBaseUrl(options?: TonalliBridgeOptions): string {
  const env = options?.env ?? getEnv();
  const rawBaseUrl =
    env.VITE_TONALLI_BASE_URL || env.VITE_TONALLI_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  let baseUrl = normalizeUrl(rawBaseUrl);
  const hostname = resolveHostname(options);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const localBaseUrl = resolveLocalBaseUrl(hostname);

  if (isLocal) {
    const shouldOverride =
      baseUrl.includes('cartera.xolosarmy.xyz') || baseUrl.startsWith('https://');
    if (shouldOverride) {
      baseUrl = localBaseUrl;
    } else {
      try {
        const baseHost = new URL(baseUrl).hostname;
        const baseIsLocal = baseHost === 'localhost' || baseHost === '127.0.0.1';
        if (baseIsLocal && baseHost !== hostname) {
          baseUrl = localBaseUrl;
        }
      } catch {
        // ignore invalid URL
      }
    }
  }

  return baseUrl;
}

export function resolveTonalliBridgeOrigin(
  baseUrl?: string,
  options?: TonalliBridgeOptions
): string {
  const env = options?.env ?? getEnv();
  const rawOrigin = normalizeUrl(env.VITE_TONALLI_BRIDGE_ORIGIN);
  if (rawOrigin) {
    return rawOrigin;
  }
  const resolvedBaseUrl = baseUrl || resolveTonalliBridgeBaseUrl(options);
  return new URL(resolvedBaseUrl).origin;
}

export function resolveTonalliBridgeConfig(options?: TonalliBridgeOptions): TonalliBridgeConfig {
  const baseUrl = resolveTonalliBridgeBaseUrl(options);
  const origin = resolveTonalliBridgeOrigin(baseUrl, options);
  const env = options?.env ?? getEnv();

  if (!logged && typeof window !== 'undefined' && isDevEnv(env)) {
    logged = true;
    const hostname = resolveHostname(options);
    console.info('[tonalli] bridge config', { hostname, baseUrl, origin });
  }

  return { baseUrl, origin };
}
