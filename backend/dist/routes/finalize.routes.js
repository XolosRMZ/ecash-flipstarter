"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const FinalizeService_js_1 = require("../services/FinalizeService.js");
const serialize_js_1 = require("./serialize.js");
const router = (0, express_1.Router)();
const service = new FinalizeService_js_1.FinalizeService();
router.post('/campaign/:id/finalize', async (req, res) => {
    try {
        const beneficiaryAddress = req.body.beneficiaryAddress;
        const tx = await service.createFinalizeTx(req.params.id, beneficiaryAddress);
        res.json((0, serialize_js_1.serializeBuiltTx)(tx));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
