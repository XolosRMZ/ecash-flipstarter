"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaigns_routes_1 = __importDefault(require("./routes/campaigns.routes"));
const pledge_routes_1 = __importDefault(require("./routes/pledge.routes"));
const finalize_routes_1 = __importDefault(require("./routes/finalize.routes"));
const refund_routes_1 = __importDefault(require("./routes/refund.routes"));
const app = (0, express_1.default)();
// CORS muy abierto para desarrollo
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express_1.default.json());
// Healthchecks
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        network: 'XEC',
        timestamp: Date.now(),
    });
});
// Rutas de la API
app.use('/api', campaigns_routes_1.default);
app.use('/api', pledge_routes_1.default);
app.use('/api', finalize_routes_1.default);
app.use('/api', refund_routes_1.default);
exports.default = app;
