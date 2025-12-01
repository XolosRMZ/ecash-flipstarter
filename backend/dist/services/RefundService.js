"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefundService = void 0;
const txBuilder_js_1 = require("../blockchain/txBuilder.js");
const CampaignService_js_1 = require("./CampaignService.js");
class RefundService {
    /**
     * Build an unsigned refund transaction draining part of the covenant to refundAddress.
     */
    async createRefundTx(campaignId, refundAddress, refundAmount) {
        const covenant = CampaignService_js_1.covenantIndexInstance.getCovenantRef(campaignId);
        if (!covenant)
            throw new Error('campaign-not-found');
        const built = await (0, txBuilder_js_1.buildRefundTx)({
            covenantUtxo: {
                txid: covenant.txid,
                vout: covenant.vout,
                value: covenant.value,
                scriptPubKey: covenant.scriptPubKey,
            },
            refundAddress,
            refundAmount,
        });
        CampaignService_js_1.covenantIndexInstance.updateValue(campaignId, covenant.value - refundAmount);
        return built;
    }
}
exports.RefundService = RefundService;
