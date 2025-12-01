import { describe, expect, it } from 'vitest';
import { validateCovenant } from '../src/covenant_campaign.js';
import type { CovenantContext } from '../src/covenant_campaign.js';

const base: Omit<CovenantContext, 'mode'> = {
  goal: 1_000_000_000n,
  expirationTime: 1_735_689_600n,
  beneficiaryPubKey: 'beneficiary',
  campaignId: 'demo',
  covenantScriptHash: 'hash',
  tx: {
    inputs: [{ value: 500_000_000n, scriptHash: 'hash', campaignId: 'demo' }],
    outputs: [],
    locktime: 1_800_000_000n,
  },
};

describe('covenant refund path', () => {
  it('fails before expiration', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'REFUND',
      tx: { ...base.tx, locktime: 1_700_000_000n },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not-expired');
  });

  it('fails once goal reached', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'REFUND',
      tx: {
        ...base.tx,
        inputs: [{ value: 1_500_000_000n, scriptHash: 'hash', campaignId: 'demo' }],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('goal-already-reached');
  });

  it('passes after expiration with decreasing covenant and refund output', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'REFUND',
      tx: {
        ...base.tx,
        outputs: [
          { value: 100_000_000n, scriptHash: 'p2pkh', address: 'refunder' },
          { value: 399_999_000n, scriptHash: 'hash', campaignId: 'demo' },
        ],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(true);
  });
});
