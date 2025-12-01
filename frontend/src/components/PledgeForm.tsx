import React, { useState } from 'react';
import { createPledgeTx } from '../api/client';
import type { BuiltTxResponse } from '../api/types';
import { getTonalliWallet } from '../wallet/tonalliConnector';

interface Props {
  campaignId: string;
  onBuiltTx?: (tx: BuiltTxResponse) => void;
}

export const PledgeForm: React.FC<Props> = ({ campaignId, onBuiltTx }) => {
  const [contributorAddress, setContributorAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [rawHex, setRawHex] = useState('');
  const [loading, setLoading] = useState(false);
  const wallet = getTonalliWallet();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const built = await createPledgeTx(campaignId, contributorAddress, BigInt(amount));
      setRawHex(built.rawHex);
      onBuiltTx?.(built);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #eee', padding: 12, borderRadius: 8 }}>
      <h4>Pledge</h4>
      <form onSubmit={submit}>
        <div>
          <label>Contributor Address</label>
          <input
            type="text"
            value={contributorAddress}
            onChange={(e) => setContributorAddress(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Amount (satoshis)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Building...' : 'Build Pledge Tx'}
        </button>
      </form>
      {rawHex && (
        <div style={{ marginTop: 12 }}>
          <p>Unsigned raw tx (hex):</p>
          <code style={{ wordBreak: 'break-all', display: 'block' }}>{rawHex}</code>
          <button disabled title="Coming soon: Tonalli integration">
            Sign & Broadcast with Tonalli
          </button>
          {!wallet && <p><em>Tonalli wallet connector not implemented yet.</em></p>}
        </div>
      )}
    </div>
  );
};
