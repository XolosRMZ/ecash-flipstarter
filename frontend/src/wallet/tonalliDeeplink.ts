import { resolveTonalliBridgeConfig } from './tonalliBridge';

type TonalliExternalSignParams = {
  unsignedTxHex: string;
  returnUrl: string;
  app?: string;
};

type TonalliCallbackEnv = {
  VITE_TONALLI_CALLBACK_URL?: string;
  DEV?: boolean;
  MODE?: string;
};

type TonalliCallbackOptions = {
  env?: TonalliCallbackEnv;
  origin?: string;
};

let callbackLogged = false;

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

export function buildTonalliExternalSignUrl(params: TonalliExternalSignParams): string {
  const { baseUrl } = resolveTonalliBridgeConfig();
  const payload = {
    unsignedTxHex: params.unsignedTxHex,
    returnUrl: params.returnUrl,
    app: params.app || 'Flipstarter',
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${baseUrl}/#/external-sign?request=${encoded}`;
}
