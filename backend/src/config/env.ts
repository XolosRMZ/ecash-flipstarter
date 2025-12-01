export interface EnvConfig {
  rpcUrl: string;
  network: 'mainnet' | 'testnet';
}

export const env: EnvConfig = {
  rpcUrl: process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL || 'http://localhost:8332',
  network: (process.env.ECASH_NETWORK as 'mainnet' | 'testnet') || 'testnet',
};
