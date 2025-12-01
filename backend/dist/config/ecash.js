"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHRONIK_BASE_URL = exports.USE_CHRONIK = exports.ECASH_BACKEND = exports.ecashConfig = void 0;
exports.ecashConfig = {
    rpcUsername: process.env.ECASH_RPC_USER || process.env.E_CASH_RPC_USER || 'user',
    rpcPassword: process.env.ECASH_RPC_PASS || process.env.E_CASH_RPC_PASS || 'pass',
    rpcUrl: process.env.ECASH_RPC_URL || process.env.E_CASH_RPC_URL || 'http://localhost:8332',
};
exports.ECASH_BACKEND = (process.env.E_CASH_BACKEND || 'rpc').toLowerCase();
exports.USE_CHRONIK = exports.ECASH_BACKEND === 'chronik';
exports.CHRONIK_BASE_URL = process.env.CHRONIK_BASE_URL || 'https://chronik.e.cash/xec';
