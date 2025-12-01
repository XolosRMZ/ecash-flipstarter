"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PledgeService_js_1 = require("../services/PledgeService.js");
const serialize_js_1 = require("./serialize.js");
const router = (0, express_1.Router)();
const service = new PledgeService_js_1.PledgeService();
router.post('/campaign/:id/pledge', async (req, res) => {
    try {
        const amount = BigInt(req.body.amount);
        const contributorAddress = req.body.contributorAddress;
        const tx = await service.createPledgeTx(req.params.id, contributorAddress, amount);
        res.json((0, serialize_js_1.serializeBuiltTx)(tx));
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
