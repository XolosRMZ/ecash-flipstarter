type TonalliExternalSignParams = {
  unsignedTxHex: string;
  env?: TonalliCallbackEnv & TonalliBridgeEnv;
};

type TonalliBridgeEnv = {
  VITE_TONALLI_BRIDGE_PATH?: string;
};

type TonalliCallbackEnv = {
  VITE_TONALLI_BASE_URL?: string;
  VITE_TONALLI_CALLBACK_URL?: string;
  DEV?: boolean;
  MODE?: string;
};

type TonalliCallbackOptions = {
  env?: TonalliCallbackEnv & TonalliBridgeEnv;
  origin?: string;
};

let callbackLogged = false;

const DEFAULT_TONALLI_BASE_URL = 'http://localhost:5174';

function getEnv(): TonalliCallbackEnv {
  return (import.meta as any).env || {};
}

function isDevEnv(env: TonalliCallbackEnv): boolean {
  if (env.DEV !== undefined) {
    return Boolean(env.DEV);
  }
  if (env.MODE) {
    return env.MODE !== 'production';
  }
  return false;
}

function resolveRuntimeOrigin(options?: TonalliCallbackOptions): string {
  if (options?.origin) return options.origin;
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function normalizeUrl(value?: string): string {
  return (value || '').trim();
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveTonalliCallbackUrl(options?: TonalliCallbackOptions): string {
  const env = options?.env ?? getEnv();
  const runtimeOrigin = resolveRuntimeOrigin(options);
  const fallback = runtimeOrigin ? `${runtimeOrigin}/#/tonalli-callback` : '/#/tonalli-callback';
  const envCallbackRaw = (env.VITE_TONALLI_CALLBACK_URL || '').trim();
  let callbackUrl = fallback;

  if (envCallbackRaw) {
    let envOrigin = '';
    try {
      envOrigin = new URL(envCallbackRaw, runtimeOrigin || 'http://localhost').origin;
    } catch {
      envOrigin = '';
    }
    const runtimeIsLocal = runtimeOrigin ? isLocalOrigin(runtimeOrigin) : false;
    const envIsLocal = envOrigin ? isLocalOrigin(envOrigin) : false;
    if (!(runtimeIsLocal && envIsLocal && envOrigin && envOrigin !== runtimeOrigin)) {
      callbackUrl = envCallbackRaw;
    }
  }

  if (!callbackLogged && typeof window !== 'undefined' && isDevEnv(env)) {
    callbackLogged = true;
    console.info('[tonalli] callback config', {
      runtimeOrigin,
      callbackUrl,
      envCallback: envCallbackRaw || undefined,
    });
  }

  return callbackUrl;
}

function encodeBase64Url(input: string): string {
  const base64 =
    typeof btoa === 'function'
      ? btoa(input)
      : Buffer.from(input, 'utf8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function uuidV4(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  if (!cryptoRef?.getRandomValues) {
    throw new Error('crypto.getRandomValues is not available');
  }
  const bytes = new Uint8Array(16);
  cryptoRef.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function resolveTonalliBaseUrl(options?: TonalliCallbackOptions): string {
  const env = options?.env ?? getEnv();
  const rawBaseUrl = env.VITE_TONALLI_BASE_URL || DEFAULT_TONALLI_BASE_URL;
  return normalizeUrl(rawBaseUrl);
}

export function buildTonalliExternalSignUrl(params: TonalliExternalSignParams): string {
  const env = (params.env ?? getEnv()) as TonalliCallbackEnv & TonalliBridgeEnv;
  const baseUrl = resolveTonalliBaseUrl({ env });
  const bridgePath = env.VITE_TONALLI_BRIDGE_PATH || '/#/external-sign';
  const payload = {
    kind: 'TONALLI_SIGN_REQUEST',
    type: 'TONALLI_SIGN_REQUEST',
    version: 1,
    requestId: uuidV4(),
    network: 'XEC',
    unsignedTxHex: params.unsignedTxHex,
    broadcast: true,
    meta: {
      app: 'ecash-flipstarter',
      flow: 'pledge',
    },
  };
  const encoded = encodeURIComponent(encodeBase64Url(JSON.stringify(payload)));
  return `${baseUrl}${bridgePath}?request=${encoded}`;
}
