import React from 'react';
import { ProgressBar } from './ProgressBar';
import type { CampaignSummary } from '../api/types';
import { Link } from 'react-router-dom';

interface Props {
  campaign: CampaignSummary;
}

export const CampaignCard: React.FC<Props> = ({ campaign }) => {
  const current = campaign.covenant ? BigInt(campaign.covenant.value) : 0n;
  const goal = campaign.goal ? BigInt(campaign.goal) : 0n;
  const daysLeft = Math.max(
    0,
    Math.floor((Number(campaign.expirationTime) * 1000 - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <h3>{campaign.name}</h3>
      <p>{campaign.description}</p>
      <ProgressBar current={current} goal={goal} />
      <p>Days left: {daysLeft}</p>
      <Link to={`/campaign/${campaign.id}`}>View details</Link>
    </div>
  );
};
