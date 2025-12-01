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
    inputs: [{ value: 100_000n, scriptHash: 'hash', campaignId: 'demo' }],
    outputs: [],
    locktime: 1_700_000_000n,
  },
};

describe('covenant pledge path', () => {
  it('passes when covenant is recreated with greater or equal value', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'PLEDGE',
      tx: {
        ...base.tx,
        outputs: [
          { value: 100_000n, scriptHash: 'other' },
          { value: 150_000n, scriptHash: 'hash', campaignId: 'demo' },
        ],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(true);
  });

  it('fails when value decreases', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'PLEDGE',
      tx: {
        ...base.tx,
        outputs: [{ value: 90_000n, scriptHash: 'hash', campaignId: 'demo' }],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('pledge-value-decreased');
  });

  it('fails when covenant output is missing', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'PLEDGE',
      tx: { ...base.tx, outputs: [{ value: 150_000n, scriptHash: 'other' }] },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('covenant-output-missing');
  });
});
