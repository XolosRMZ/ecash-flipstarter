import {
  checkBalanceConsistency,
  findCovenantInput,
  findCovenantOutput,
  sumCovenantInputValues,
  type IntrospectedTx,
} from './introspection_helpers.js';

export type CovenantMode = 'PLEDGE' | 'FINALIZE' | 'REFUND';

export interface CovenantContext {
  mode: CovenantMode;
  goal: bigint;
  expirationTime: bigint;
  beneficiaryPubKey: string;
  campaignId: string;
  tx: IntrospectedTx;
  covenantInputIndex?: number;
  covenantScriptHash: string;
}

export interface CovenantResult {
  ok: boolean;
  error?: string;
}

/**
 * Entry point for covenant validation.
 * Selects the correct logical path based on mode and applies covenant constraints.
 */
export function validateCovenant(ctx: CovenantContext): CovenantResult {
  switch (ctx.mode) {
    case 'PLEDGE':
      return validatePledge(ctx);
    case 'FINALIZE':
      return validateFinalize(ctx);
    case 'REFUND':
      return validateRefund(ctx);
    default:
      return { ok: false, error: 'invalid-mode' };
  }
}

/**
 * PLEDGE: consumes covenant UTXO and recreates it with same script and >= value.
 * TODO: optionally disallow pledges after expiration time once wallet/clock alignment is finalized.
 */
export function validatePledge(ctx: CovenantContext): CovenantResult {
  const covenantInputIdx =
    ctx.covenantInputIndex ?? findCovenantInput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId);
  if (covenantInputIdx < 0) return { ok: false, error: 'covenant-input-missing' };

  const recreatedIdx = findCovenantOutput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId);
  if (recreatedIdx < 0) return { ok: false, error: 'covenant-output-missing' };

  const covenantValue = sumCovenantInputValues(ctx.tx, [covenantInputIdx]);
  const newValue = ctx.tx.outputs[recreatedIdx].value;
  if (newValue < covenantValue) return { ok: false, error: 'pledge-value-decreased' };

  return { ok: true };
}

/**
 * FINALIZE: allowed only once GOAL is reached; covenant is spent entirely to beneficiary.
 */
export function validateFinalize(ctx: CovenantContext): CovenantResult {
  const covenantInputIdx =
    ctx.covenantInputIndex ?? findCovenantInput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId);
  if (covenantInputIdx < 0) return { ok: false, error: 'covenant-input-missing' };

  const covenantValue = sumCovenantInputValues(ctx.tx, [covenantInputIdx]);
  if (covenantValue < ctx.goal) return { ok: false, error: 'goal-not-reached' };

  const beneficiaryOutput = ctx.tx.outputs[0];
  if (!beneficiaryOutput || !isBeneficiaryOutput(beneficiaryOutput, ctx.beneficiaryPubKey)) {
    return { ok: false, error: 'beneficiary-output-invalid' };
  }

  if (beneficiaryOutput.value !== covenantValue) {
    return { ok: false, error: 'beneficiary-value-mismatch' };
  }

  if (findCovenantOutput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId) !== -1) {
    return { ok: false, error: 'covenant-should-terminate' };
  }

  return { ok: true };
}

/**
 * REFUND: after expiration and only if goal is not met; covenant can be drained.
 */
export function validateRefund(ctx: CovenantContext): CovenantResult {
  const covenantInputIdx =
    ctx.covenantInputIndex ?? findCovenantInput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId);
  if (covenantInputIdx < 0) return { ok: false, error: 'covenant-input-missing' };

  const currentTime = ctx.tx.locktime;
  if (currentTime < ctx.expirationTime) return { ok: false, error: 'not-expired' };

  const covenantValue = sumCovenantInputValues(ctx.tx, [covenantInputIdx]);
  if (covenantValue >= ctx.goal) return { ok: false, error: 'goal-already-reached' };

  const recreatedIdx = findCovenantOutput(ctx.tx, ctx.covenantScriptHash, ctx.campaignId);
  if (recreatedIdx >= 0) {
    const newValue = ctx.tx.outputs[recreatedIdx].value;
    if (newValue >= covenantValue) return { ok: false, error: 'refund-not-draining' };
  }

  if (!checkBalanceConsistency(ctx.tx)) return { ok: false, error: 'balance-inconsistent' };

  return { ok: true };
}

function isBeneficiaryOutput(
  output: IntrospectedTx['outputs'][number],
  beneficiaryPubKey: string,
): boolean {
  return output.address === beneficiaryPubKey || output.scriptHash === beneficiaryPubKey;
}
