import type {
  BuiltTxResponse,
  CampaignDetail,
  CampaignSummary,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

async function jsonFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || `Request failed ${res.status}`);
  }
  return res.json();
}

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  return jsonFetch<CampaignSummary[]>(`/campaign`);
}

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  return jsonFetch<CampaignDetail>(`/campaign/${id}`);
}

export async function createPledgeTx(
  campaignId: string,
  contributorAddress: string,
  amount: bigint,
): Promise<BuiltTxResponse> {
  return jsonFetch<BuiltTxResponse>(`/campaign/${campaignId}/pledge`, {
    method: 'POST',
    body: JSON.stringify({ contributorAddress, amount: amount.toString() }),
  });
}
