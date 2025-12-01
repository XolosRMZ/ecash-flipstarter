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
    inputs: [{ value: 1_000_000_000n, scriptHash: 'hash', campaignId: 'demo' }],
    outputs: [],
    locktime: 1_700_000_000n,
  },
};

describe('covenant finalize path', () => {
  it('fails if goal not met', () => {
    const ctx: CovenantContext = {
      ...base,
      tx: {
        ...base.tx,
        inputs: [{ value: 900_000_000n, scriptHash: 'hash', campaignId: 'demo' }],
        outputs: [{ value: 900_000_000n, scriptHash: 'p2pkh', address: 'beneficiary' }],
      },
      mode: 'FINALIZE',
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('goal-not-reached');
  });

  it('passes when goal reached, beneficiary paid, and covenant not recreated', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'FINALIZE',
      tx: {
        ...base.tx,
        outputs: [{ value: 1_000_000_000n, scriptHash: 'p2pkh', address: 'beneficiary' }],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(true);
  });

  it('fails if covenant is recreated', () => {
    const ctx: CovenantContext = {
      ...base,
      mode: 'FINALIZE',
      tx: {
        ...base.tx,
        outputs: [
          { value: 1_000_000_000n, scriptHash: 'p2pkh', address: 'beneficiary' },
          { value: 1_000_000_000n, scriptHash: 'hash', campaignId: 'demo' },
        ],
      },
    };
    const result = validateCovenant(ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('covenant-should-terminate');
  });
});
