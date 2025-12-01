export interface CampaignDefinition {
  id: string;
  name: string;
  description: string;
  goal: bigint;
  expirationTime: bigint;
  beneficiaryPubKey: string;
  beneficiaryAddress?: string;
}
