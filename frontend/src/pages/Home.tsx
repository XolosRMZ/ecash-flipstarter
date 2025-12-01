import React, { useEffect, useState } from 'react';
import { fetchCampaigns } from '../api/client';
import type { CampaignSummary } from '../api/types';
import { CampaignCard } from '../components/CampaignCard';

export const Home: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);

  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);

  return (
    <div>
      <h2>Flipstarter 2.0 Campaigns</h2>
      {campaigns.length === 0 && <p>No campaigns listed yet (listing endpoint TBD).</p>}
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </div>
  );
};
