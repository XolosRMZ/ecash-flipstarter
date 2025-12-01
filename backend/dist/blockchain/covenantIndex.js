"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CovenantIndex = void 0;
/**
 * In-memory covenant reference index; replace with DB or Chronik/indexer later.
 */
class CovenantIndex {
    constructor() {
        this.byCampaign = new Map();
    }
    setCovenantRef(ref) {
        this.byCampaign.set(ref.campaignId, ref);
    }
    getCovenantRef(campaignId) {
        return this.byCampaign.get(campaignId);
    }
    updateValue(campaignId, newValue) {
        const ref = this.byCampaign.get(campaignId);
        if (ref) {
            this.byCampaign.set(campaignId, { ...ref, value: newValue });
        }
    }
}
exports.CovenantIndex = CovenantIndex;
