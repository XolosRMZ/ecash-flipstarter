"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinalizeService = void 0;
const txBuilder_js_1 = require("../blockchain/txBuilder.js");
const CampaignService_js_1 = require("./CampaignService.js");
class FinalizeService {
    /** Build an unsigned finalize transaction paying the beneficiary. */
    async createFinalizeTx(campaignId, beneficiaryAddress) {
        const covenant = CampaignService_js_1.covenantIndexInstance.getCovenantRef(campaignId);
        if (!covenant)
            throw new Error('campaign-not-found');
        const built = await (0, txBuilder_js_1.buildFinalizeTx)({
            covenantUtxo: {
                txid: covenant.txid,
                vout: covenant.vout,
                value: covenant.value,
                scriptPubKey: covenant.scriptPubKey,
            },
            beneficiaryAddress,
        });
        // Covenant should terminate after finalize; value becomes zero locally.
        CampaignService_js_1.covenantIndexInstance.updateValue(campaignId, 0n);
        return built;
    }
}
exports.FinalizeService = FinalizeService;
