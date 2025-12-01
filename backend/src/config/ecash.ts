export const ecashConfig = {
  rpcUsername: process.env.ECASH_RPC_USER || process.env.E_CASH_RPC_USER || 'user',
  rpcPassword: process.env.ECASH_RPC_PASS || process.env.E_CASH_RPC_PASS || 'pass',
  rpcUrl: process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL || 'http://localhost:8332',
};

export const ECASH_BACKEND = (process.env.E_CASH_BACKEND || 'rpc').toLowerCase();
export const USE_CHRONIK = ECASH_BACKEND === 'chronik';
export const CHRONIK_BASE_URL =
  process.env.CHRONIK_BASE_URL || 'https://chronik.e.cash/xec';
