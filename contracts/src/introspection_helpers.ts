export interface IntrospectedInput {
  value: bigint;
  scriptHash: string;
  campaignId?: string;
}

export interface IntrospectedOutput {
  value: bigint;
  scriptHash: string;
  campaignId?: string;
  address?: string;
}

export interface IntrospectedTx {
  inputs: IntrospectedInput[];
  outputs: IntrospectedOutput[];
  locktime: bigint;
}

/**
 * Locate the covenant input by script hash or optional campaign id.
 */
export function findCovenantInput(
  tx: IntrospectedTx,
  scriptHash: string,
  campaignId?: string,
): number {
  return tx.inputs.findIndex(
    (input) => input.scriptHash === scriptHash || (campaignId && input.campaignId === campaignId),
  );
}

/**
 * Locate the covenant output by script hash or optional campaign id.
 */
export function findCovenantOutput(
  tx: IntrospectedTx,
  scriptHash: string,
  campaignId?: string,
): number {
  return tx.outputs.findIndex(
    (output) => output.scriptHash === scriptHash || (campaignId && output.campaignId === campaignId),
  );
}

/**
 * Sum the covenant input values across the provided indexes.
 */
export function sumCovenantInputValues(tx: IntrospectedTx, indexes: number[]): bigint {
  return indexes.reduce((acc, idx) => acc + (tx.inputs[idx]?.value ?? 0n), 0n);
}

/**
 * Balance check to ensure inputs cover outputs (fee is implicit difference).
 */
export function checkBalanceConsistency(tx: IntrospectedTx): boolean {
  const totalIn = tx.inputs.reduce((acc, i) => acc + i.value, 0n);
  const totalOut = tx.outputs.reduce((acc, o) => acc + o.value, 0n);
  return totalIn >= totalOut;
}
