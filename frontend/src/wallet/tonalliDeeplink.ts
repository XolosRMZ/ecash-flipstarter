type TonalliExternalSignParams = {
  unsignedTxHex: string;
};

type TonalliCallbackEnv = {
  VITE_TONALLI_BASE_URL?: string;
  VITE_TONALLI_CALLBACK_URL?: string;
  DEV?: boolean;
  MODE?: string;
};

type TonalliCallbackOptions = {
  env?: TonalliCallbackEnv;
  origin?: string;
};

let callbackLogged = false;

const DEFAULT_TONALLI_BASE_URL = 'http://127.0.0.1:5174';

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
  return (value || '').trim().replace(/\/+$/, '');
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

function resolveTonalliBaseUrl(options?: TonalliCallbackOptions): string {
  const env = options?.env ?? getEnv();
  const rawBaseUrl = env.VITE_TONALLI_BASE_URL || DEFAULT_TONALLI_BASE_URL;
  let baseUrl = normalizeUrl(rawBaseUrl);
  const runtimeOrigin = resolveRuntimeOrigin(options);

  if (runtimeOrigin && isLocalOrigin(runtimeOrigin)) {
    try {
      const runtimeUrl = new URL(runtimeOrigin);
      const baseUrlObj = new URL(baseUrl);
      const baseIsLocal = isLocalOrigin(baseUrlObj.origin);
      if (baseIsLocal && baseUrlObj.hostname !== runtimeUrl.hostname) {
        baseUrlObj.hostname = runtimeUrl.hostname;
        baseUrl = normalizeUrl(baseUrlObj.toString());
      }
    } catch {
      // ignore invalid URL
    }
  }

  return baseUrl;
}

export function buildTonalliExternalSignUrl(params: TonalliExternalSignParams): string {
  const baseUrl = resolveTonalliBaseUrl();
  const payload = {
    type: 'TONALLI_SIGN_REQUEST',
    version: 1,
    network: 'XEC',
    unsignedTxHex: params.unsignedTxHex,
    broadcast: true,
    meta: {
      app: 'ecash-flipstarter',
      flow: 'pledge',
    },
  };
  const encoded = encodeURIComponent(encodeBase64Url(JSON.stringify(payload)));
  return `${baseUrl}/#/external-sign?request=${encoded}`;
}
