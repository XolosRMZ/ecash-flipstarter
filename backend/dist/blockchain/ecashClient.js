"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUtxosForAddress = getUtxosForAddress;
exports.broadcastRawTx = broadcastRawTx;
exports.rpcCall = rpcCall;
const ecash_js_1 = require("../config/ecash.js");
const rpcUrl = ecash_js_1.ecashConfig.rpcUrl;
const rpcUser = ecash_js_1.ecashConfig.rpcUsername;
const rpcPass = ecash_js_1.ecashConfig.rpcPassword;
/**
 * Query UTXOs for a given address using Chronik or RPC depending on config.
 */
async function getUtxosForAddress(address) {
    if (ecash_js_1.USE_CHRONIK) {
        return getUtxosForAddressViaChronik(address);
    }
    return getUtxosForAddressViaRpc(address);
}
/**
 * Broadcast a raw transaction using Chronik or RPC depending on config.
 */
async function broadcastRawTx(rawTxHex) {
    if (ecash_js_1.USE_CHRONIK) {
        return broadcastRawTxViaChronik(rawTxHex);
    }
    return broadcastRawTxViaRpc(rawTxHex);
}
async function getUtxosForAddressViaChronik(address) {
    const url = `${ecash_js_1.CHRONIK_BASE_URL}/address/${address}/utxos`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`chronik-utxos-failed: status ${res.status}`);
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.utxos))
        return [];
    return data.utxos.map((u) => ({
        txid: u.outpoint.txid,
        vout: u.outpoint.outIdx,
        value: BigInt(u.value),
        scriptPubKey: u.script,
    }));
}
async function broadcastRawTxViaChronik(rawTxHex) {
    const url = `${ecash_js_1.CHRONIK_BASE_URL}/tx`;
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
async function rpcCall(method, params = []) {
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
        return json.result;
    }
    catch (err) {
        console.error(`RPC call failed for ${method}:`, err);
        throw err;
    }
}
async function getUtxosForAddressViaRpc(address) {
    const utxos = await rpcCall('listunspent', [0, 9999999, [address]]);
    return utxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: BigInt(Math.round(u.amount * 1e8)), // assume amount in XEC float
        scriptPubKey: u.scriptPubKey,
    }));
}
async function broadcastRawTxViaRpc(rawTxHex) {
    const txid = await rpcCall('sendrawtransaction', [rawTxHex]);
    return { txid };
}
