export const ecashConfig = {
  rpcUsername: process.env.ECASH_RPC_USER || process.env.E_CASH_RPC_USER || 'user',
  rpcPassword: process.env.ECASH_RPC_PASS || process.env.E_CASH_RPC_PASS || 'pass',
  rpcUrl: process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL || 'http://localhost:8332',
};

const hasRpcEnv =
  !!(process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL) ||
  !!(process.env.ECASH_RPC_USER || process.env.E_CASH_RPC_USER) ||
  !!(process.env.ECASH_RPC_PASS || process.env.E_CASH_RPC_PASS);

export const ECASH_BACKEND = (
  process.env.E_CASH_BACKEND || (hasRpcEnv ? 'rpc' : 'chronik')
).toLowerCase();
export const USE_CHRONIK = ECASH_BACKEND === 'chronik';
export const USE_MOCK = ECASH_BACKEND === 'mock';

function sanitizeChronikBaseUrl(value: string, enforce: boolean): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    if (enforce) throw new Error('CHRONIK_BASE_URL is required');
    return trimmed;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    if (enforce) throw new Error('CHRONIK_BASE_URL must start with http:// or https://');
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    const hasNetworkSuffix = normalizedPath === '/xec' || normalizedPath === '/v2';
    if (!hasNetworkSuffix) {
      if (enforce) {
        throw new Error('CHRONIK_BASE_URL must include the /xec network suffix');
      }
    }
    if (url.search || url.hash) {
      if (enforce) {
        throw new Error('CHRONIK_BASE_URL must not include query or hash');
      }
    }
    return `${url.origin}${normalizedPath}`;
  } catch (err) {
    if (enforce) {
      throw new Error(
        `CHRONIK_BASE_URL is invalid: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return trimmed;
  }
}

const rawChronikBaseUrl =
  process.env.CHRONIK_BASE_URL || 'https://chronik.e.cash/xec';

export const CHRONIK_BASE_URL = sanitizeChronikBaseUrl(rawChronikBaseUrl, USE_CHRONIK);
