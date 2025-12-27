import React, { useState } from 'react';
import { broadcastTx, createPledgeTx } from '../api/client';
import type { BuiltTxResponse } from '../api/types';
import { signAndBroadcastWithTonalli } from '../wallet/tonalliConnector';

interface Props {
  campaignId: string;
  onBuiltTx?: (tx: BuiltTxResponse) => void;
  onBroadcastSuccess?: () => void;
}

export const PledgeForm: React.FC<Props> = ({
  campaignId,
  onBuiltTx,
  onBroadcastSuccess,
}) => {
  const [contributorAddress, setContributorAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [unsignedHex, setUnsignedHex] = useState('');
  const [signedHex, setSignedHex] = useState('');
  const [broadcastResult, setBroadcastResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [tonalliLoading, setTonalliLoading] = useState(false);
  const [tonalliResult, setTonalliResult] = useState('');
  const [tonalliPopupUrl, setTonalliPopupUrl] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBroadcastResult('');
    try {
      const built = await createPledgeTx(campaignId, contributorAddress, BigInt(amount));
      const hex = built.unsignedTxHex || built.rawHex || '';
      setUnsignedHex(hex);
      setSignedHex('');
      onBuiltTx?.(built);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copyUnsigned = async () => {
    try {
      await navigator.clipboard.writeText(unsignedHex);
      setBroadcastResult('Unsigned tx copied.');
    } catch (err) {
      alert('No se pudo copiar el hex.');
    }
  };

  const handleBroadcast = async () => {
    if (!signedHex.trim()) {
      alert('Signed tx hex requerido.');
      return;
    }
    setBroadcasting(true);
    setBroadcastResult('');
    try {
      const result = await broadcastTx(signedHex);
      setBroadcastResult(`Broadcasted. TXID: ${result.txid}`);
    } catch (err) {
      setBroadcastResult(`Error: ${(err as Error).message}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleTonalli = async () => {
    setTonalliLoading(true);
    setTonalliResult('');
    setTonalliPopupUrl('');
    try {
      const result = await signAndBroadcastWithTonalli({
        kind: 'pledge',
        campaignId,
        unsignedTxHex: unsignedHex,
      });
      if (result.ok && result.txid) {
        setTonalliResult(`Tonalli broadcasted. TXID: ${result.txid}`);
        onBroadcastSuccess?.();
      } else {
        setTonalliResult(result.error || 'Tonalli request failed');
        if (result.popupUrl) {
          setTonalliPopupUrl(result.popupUrl);
        }
      }
    } catch (err) {
      setTonalliResult(`Error: ${(err as Error).message}`);
    } finally {
      setTonalliLoading(false);
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
      {unsignedHex && (
        <div style={{ marginTop: 12 }}>
          <p>Unsigned tx hex:</p>
          <textarea
            readOnly
            value={unsignedHex}
            rows={6}
            style={{ width: '100%', wordBreak: 'break-all' }}
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={copyUnsigned}>
              Copy unsigned tx
            </button>
          </div>
          <p style={{ marginTop: 8 }}>
            Firma este hex en Tonalli o herramienta externa, luego pega el hex firmado abajo para
            hacer broadcast.
          </p>
          <label>Signed Tx Hex</label>
          <textarea
            value={signedHex}
            onChange={(e) => setSignedHex(e.target.value)}
            rows={6}
            style={{ width: '100%', wordBreak: 'break-all' }}
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={handleBroadcast} disabled={broadcasting}>
              {broadcasting ? 'Broadcasting...' : 'Broadcast signed tx'}
            </button>
          </div>
          {broadcastResult && <p>{broadcastResult}</p>}
          <button type="button" onClick={handleTonalli} disabled={tonalliLoading}>
            {tonalliLoading ? 'Opening Tonalli...' : 'Sign & Broadcast with Tonalli'}
          </button>
          {tonalliPopupUrl && (
            <p>
              <a href={tonalliPopupUrl} target="_blank" rel="noreferrer">
                Open Tonalli in a new tab
              </a>
            </p>
          )}
          {tonalliResult && <p>{tonalliResult}</p>}
          <p>
            <em>Si Tonalli no abre, usa el flujo de pegar hex firmado y hacer broadcast.</em>
          </p>
        </div>
      )}
    </div>
  );
};
