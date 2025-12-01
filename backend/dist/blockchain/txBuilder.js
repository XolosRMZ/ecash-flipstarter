"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPledgeTx = buildPledgeTx;
exports.buildFinalizeTx = buildFinalizeTx;
exports.buildRefundTx = buildRefundTx;
const ecashClient_js_1 = require("./ecashClient.js");
async function buildPledgeTx(params) {
    const totalContributor = params.contributorUtxos.reduce((acc, u) => acc + u.value, 0n);
    const totalInput = totalContributor + params.covenantUtxo.value;
    const newCovenantValue = params.covenantUtxo.value + params.amount;
    if (totalInput < newCovenantValue)
        throw new Error('insufficient-funds-for-pledge');
    const covenantScript = params.covenantUtxo.scriptPubKey;
    const change = totalInput - newCovenantValue;
    const changeScript = change > 0n ? await addressToScriptPubKey(params.contributorAddress) : '';
    const unsigned = {
        inputs: [...params.contributorUtxos, params.covenantUtxo],
        outputs: [
            { value: newCovenantValue, scriptPubKey: covenantScript },
            ...(change > 0n ? [{ value: change, scriptPubKey: changeScript }] : []),
        ],
    };
    return { unsignedTx: unsigned, rawHex: serializeUnsignedTx(unsigned) };
}
async function buildFinalizeTx(params) {
    const beneficiaryScript = await addressToScriptPubKey(params.beneficiaryAddress);
    const unsigned = {
        inputs: [params.covenantUtxo],
        outputs: [{ value: params.covenantUtxo.value, scriptPubKey: beneficiaryScript }],
    };
    return { unsignedTx: unsigned, rawHex: serializeUnsignedTx(unsigned) };
}
async function buildRefundTx(params) {
    if (params.refundAmount > params.covenantUtxo.value)
        throw new Error('refund-too-large');
    const refundScript = await addressToScriptPubKey(params.refundAddress);
    const remaining = params.covenantUtxo.value - params.refundAmount;
    const outputs = [{ value: params.refundAmount, scriptPubKey: refundScript }];
    if (remaining > 0n) {
        outputs.push({ value: remaining, scriptPubKey: params.covenantUtxo.scriptPubKey });
    }
    const unsigned = {
        inputs: [params.covenantUtxo],
        outputs,
    };
    return { unsignedTx: unsigned, rawHex: serializeUnsignedTx(unsigned) };
}
async function addressToScriptPubKey(address) {
    // Delegates to node RPC so we avoid local address parsing discrepancies.
    const info = await (0, ecashClient_js_1.rpcCall)('validateaddress', [address]);
    if (info && info.scriptPubKey)
        return info.scriptPubKey;
    throw new Error('could-not-derive-scriptPubKey');
}
function serializeUnsignedTx(unsignedTx) {
    const version = 2;
    const locktime = unsignedTx.locktime ?? 0;
    const chunks = [];
    writeUInt32LE(chunks, version);
    writeVarInt(chunks, unsignedTx.inputs.length);
    for (const input of unsignedTx.inputs) {
        writeTxid(chunks, input.txid);
        writeUInt32LE(chunks, input.vout);
        writeVarInt(chunks, 0); // empty scriptSig for unsigned
        writeUInt32LE(chunks, 0xffffffff); // sequence
    }
    writeVarInt(chunks, unsignedTx.outputs.length);
    for (const output of unsignedTx.outputs) {
        writeUInt64LE(chunks, output.value);
        const scriptBytes = hexToBytes(output.scriptPubKey);
        writeVarInt(chunks, scriptBytes.length);
        chunks.push(...scriptBytes);
    }
    writeUInt32LE(chunks, locktime);
    return Buffer.from(chunks).toString('hex');
}
function writeUInt32LE(arr, value) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value >>> 0);
    arr.push(...buf);
}
function writeUInt64LE(arr, value) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value);
    arr.push(...buf);
}
function writeVarInt(arr, value) {
    if (value < 0xfd) {
        arr.push(value);
    }
    else if (value <= 0xffff) {
        arr.push(0xfd, value & 0xff, (value >> 8) & 0xff);
    }
    else if (value <= 0xffffffff) {
        arr.push(0xfe, value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
    }
    else {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(value));
        arr.push(0xff, ...buf);
    }
}
function writeTxid(arr, txid) {
    const bytes = hexToBytes(txid).reverse(); // txid is big-endian; wire format little-endian
    arr.push(...bytes);
}
function hexToBytes(hex) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) {
        bytes.push(parseInt(clean.slice(i, i + 2), 16));
    }
    return bytes;
}
