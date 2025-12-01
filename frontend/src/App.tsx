import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { CampaignDetail } from './pages/CampaignDetail';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaign/:id" element={<CampaignDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};
