"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PledgeService = void 0;
const ecashClient_js_1 = require("../blockchain/ecashClient.js");
const txBuilder_js_1 = require("../blockchain/txBuilder.js");
const CampaignService_js_1 = require("./CampaignService.js");
class PledgeService {
    /**
     * Build an unsigned pledge transaction for a contributor.
     */
    async createPledgeTx(campaignId, contributorAddress, amount) {
        const covenant = CampaignService_js_1.covenantIndexInstance.getCovenantRef(campaignId);
        if (!covenant)
            throw new Error('campaign-not-found');
        const contributorUtxos = await (0, ecashClient_js_1.getUtxosForAddress)(contributorAddress);
        const selected = selectUtxos(contributorUtxos, amount);
        const built = await (0, txBuilder_js_1.buildPledgeTx)({
            contributorUtxos: selected,
            covenantUtxo: {
                txid: covenant.txid,
                vout: covenant.vout,
                value: covenant.value,
                scriptPubKey: covenant.scriptPubKey,
            },
            amount,
            covenantScriptHash: covenant.scriptHash,
            contributorAddress,
        });
        // Optimistic update; real deployment should update after broadcast/confirmation.
        const nextValue = covenant.value + amount;
        CampaignService_js_1.covenantIndexInstance.updateValue(campaignId, nextValue);
        return { ...built, nextCovenantValue: nextValue };
    }
}
exports.PledgeService = PledgeService;
function selectUtxos(utxos, target) {
    let total = 0n;
    const selected = [];
    for (const utxo of utxos) {
        selected.push(utxo);
        total += utxo.value;
        if (total >= target)
            break;
    }
    if (total < target)
        throw new Error('insufficient-funds');
    return selected;
}
