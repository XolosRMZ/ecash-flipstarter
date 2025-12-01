import { CHRONIK_BASE_URL, USE_CHRONIK, ecashConfig } from '../config/ecash.js';
import type { BroadcastResult, Utxo } from './types.js';

const rpcUrl = ecashConfig.rpcUrl;
const rpcUser = ecashConfig.rpcUsername;
const rpcPass = ecashConfig.rpcPassword;

/**
 * Query UTXOs for a given address using Chronik or RPC depending on config.
 */
export async function getUtxosForAddress(address: string): Promise<Utxo[]> {
  if (USE_CHRONIK) {
    return getUtxosForAddressViaChronik(address);
  }
  return getUtxosForAddressViaRpc(address);
}

/**
 * Broadcast a raw transaction using Chronik or RPC depending on config.
 */
export async function broadcastRawTx(rawTxHex: string): Promise<BroadcastResult> {
  if (USE_CHRONIK) {
    return broadcastRawTxViaChronik(rawTxHex);
  }
  return broadcastRawTxViaRpc(rawTxHex);
}

async function getUtxosForAddressViaChronik(address: string): Promise<Utxo[]> {
  const url = `${CHRONIK_BASE_URL}/address/${address}/utxos`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`chronik-utxos-failed: status ${res.status}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.utxos)) return [];
  return data.utxos.map((u: any) => ({
    txid: u.outpoint.txid,
    vout: u.outpoint.outIdx,
    value: BigInt(u.value),
    scriptPubKey: u.script,
  }));
}

async function broadcastRawTxViaChronik(rawTxHex: string): Promise<BroadcastResult> {
  const url = `${CHRONIK_BASE_URL}/tx`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawTxHex,
  });
  if (!res.ok) {
    throw new Error(`chronik-broadcast-failed: status ${res.status}`);
  }
  const data = await res.json();
  if (!data || !data.txid) {
    throw new Error('chronik-broadcast-missing-txid');
  }
  return { txid: data.txid };
}

/**
 * Perform a JSON-RPC call against the configured eCash node.
 */
export async function rpcCall<T = any>(method: string, params: any[] = []): Promise<T> {
  const auth = Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64');
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body,
    });
    const json = await res.json();
    if (json.error) {
      console.error(`RPC error ${method}:`, json.error);
      throw new Error(json.error.message || 'rpc-error');
    }
    return json.result as T;
  } catch (err) {
    console.error(`RPC call failed for ${method}:`, err);
    throw err;
  }
}

async function getUtxosForAddressViaRpc(address: string): Promise<Utxo[]> {
  const utxos = await rpcCall<any[]>('listunspent', [0, 9999999, [address]]);
  return utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    value: BigInt(Math.round(u.amount * 1e8)), // assume amount in XEC float
    scriptPubKey: u.scriptPubKey,
  }));
}

async function broadcastRawTxViaRpc(rawTxHex: string): Promise<BroadcastResult> {
  const txid = await rpcCall<string>('sendrawtransaction', [rawTxHex]);
  return { txid };
}
