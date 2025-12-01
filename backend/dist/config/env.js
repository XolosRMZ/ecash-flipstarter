"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.env = {
    rpcUrl: process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL || 'http://localhost:8332',
    network: process.env.ECASH_NETWORK || 'testnet',
};
