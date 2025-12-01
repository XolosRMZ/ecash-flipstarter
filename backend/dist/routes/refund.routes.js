"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const RefundService_js_1 = require("../services/RefundService.js");
const serialize_js_1 = require("./serialize.js");
const router = (0, express_1.Router)();
const service = new RefundService_js_1.RefundService();
router.post('/campaign/:id/refund', async (req, res) => {
    try {
        const refundAddress = req.body.refundAddress;
        const refundAmount = BigInt(req.body.refundAmount);
        const tx = await service.createRefundTx(req.params.id, refundAddress, refundAmount);
        res.json((0, serialize_js_1.serializeBuiltTx)(tx));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
