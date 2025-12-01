"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CampaignService_js_1 = require("../services/CampaignService.js");
const router = (0, express_1.Router)();
const service = new CampaignService_js_1.CampaignService();
router.post('/campaign', async (req, res) => {
    try {
        const campaign = await service.createCampaign(req.body);
        res.json(campaign);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/campaign', async (_req, res) => {
    try {
        res.json(service.listCampaigns());
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.get('/campaign/:id', async (req, res) => {
    try {
        const campaign = await service.getCampaign(req.params.id);
        if (!campaign)
            return res.status(404).json({ error: 'campaign-not-found' });
        res.json(campaign);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
exports.default = router;
