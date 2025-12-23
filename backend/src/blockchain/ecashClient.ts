import {
  CHRONIK_BASE_URL,
  USE_CHRONIK,
  USE_MOCK,
  ecashConfig,
} from '../config/ecash';
import { ChronikClient } from 'chronik-client';
import type { BroadcastResult, Utxo } from './types';

const rpcUrl = ecashConfig.rpcUrl;
const rpcUser = ecashConfig.rpcUsername;
const rpcPass = ecashConfig.rpcPassword;

const chronikBaseUrl = CHRONIK_BASE_URL.replace(/\/$/, '');
const chronik = new ChronikClient([chronikBaseUrl]);

function normalizeChronikAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.toLowerCase().startsWith('ecash:')) {
    return trimmed.slice('ecash:'.length);
  }
  return trimmed;
}

/**
 * Query UTXOs for a given address using Chronik or RPC depending on config.
 */
export async function getUtxosForAddress(address: string): Promise<Utxo[]> {
  if (USE_MOCK) {
    return [
      {
        txid: 'mocked-utxo-txid-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        vout: 0,
        value: 500000000n,
        scriptPubKey: '6a',
      },
    ];
  }
  if (USE_CHRONIK) {
    return getUtxosForAddressViaChronik(address);
  }
  return getUtxosForAddressViaRpc(address);
}

/**
 * Broadcast a raw transaction using Chronik or RPC depending on config.
 */
export async function broadcastRawTx(rawTxHex: string): Promise<BroadcastResult> {
  if (USE_MOCK) {
    return { txid: `mock-txid-${Date.now().toString(16)}` };
  }
  if (USE_CHRONIK) {
    return broadcastRawTxViaChronik(rawTxHex);
  }
  return broadcastRawTxViaRpc(rawTxHex);
}

async function getUtxosForAddressViaChronik(address: string): Promise<Utxo[]> {
  const normalizedAddress = normalizeChronikAddress(address);
  const scriptUtxos = await chronik.address(normalizedAddress).utxos();
  return scriptUtxos.utxos.map((u) => ({
    txid: u.outpoint.txid,
    vout: u.outpoint.outIdx,
    value: u.sats,
    scriptPubKey: scriptUtxos.outputScript,
  }));
}

async function broadcastRawTxViaChronik(rawTxHex: string): Promise<BroadcastResult> {
  const data = await chronik.broadcastTx(rawTxHex);
  return { txid: data.txid };
}

export async function getChronikBlockchainInfo() {
  return chronik.blockchainInfo();
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

export async function addressToScriptPubKey(address: string): Promise<string> {
  if (USE_MOCK) {
    return '6a';
  }
  try {
    const info = await rpcCall<any>('validateaddress', [address]);
    if (info && info.scriptPubKey) {
      return info.scriptPubKey as string;
    }
  } catch (err) {
    console.error(`Error derivando scriptPubKey de ${address}:`, err);
  }
  throw new Error('could-not-derive-scriptPubKey');
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
