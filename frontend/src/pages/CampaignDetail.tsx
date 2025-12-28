import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCampaign } from '../api/client';
import type { CampaignDetail as DetailType } from '../api/types';
import { ProgressBar } from '../components/ProgressBar';
import { PledgeForm } from '../components/PledgeForm';

export const CampaignDetail: React.FC = () => {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<DetailType | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchCampaign(id).then(setCampaign).catch(() => setCampaign(null));
  }, [id]);
  const refreshCampaign = () => {
    if (!id) return;
    fetchCampaign(id).then(setCampaign).catch(() => setCampaign(null));
  };

  if (!id) return <p>Missing campaign id</p>;
  if (!campaign) return <p>Loading campaign...</p>;

  const current = campaign.covenant ? BigInt(campaign.covenant.value) : 0n;
  const goal = campaign.goal ? BigInt(campaign.goal) : 0n;

  return (
    <div>
      <Link to="/">Back</Link>
      <h2>{campaign.name}</h2>
      <p>{campaign.description}</p>
      <ProgressBar current={current} goal={goal} />
      <p>Goal: {goal.toString()} sat</p>
      <p>Current: {current.toString()} sat</p>
      <PledgeForm campaignId={id} onBroadcastSuccess={refreshCampaign} />
    </div>
  );
};
