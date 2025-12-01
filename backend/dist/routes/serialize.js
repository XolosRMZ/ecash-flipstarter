"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeBuiltTx = serializeBuiltTx;
function serializeBuiltTx(built) {
    return {
        ...built,
        unsignedTx: {
            ...built.unsignedTx,
            inputs: built.unsignedTx.inputs.map((i) => ({ ...i, value: i.value.toString() })),
            outputs: built.unsignedTx.outputs.map((o) => ({ ...o, value: o.value.toString() })),
            locktime: built.unsignedTx.locktime,
        },
        rawHex: built.rawHex,
        // carry any extra fields (e.g., nextCovenantValue) converting BigInt to string
        ...(typeof built.nextCovenantValue !== 'undefined'
            ? { nextCovenantValue: built.nextCovenantValue.toString() }
            : {}),
    };
}
