// Lightweight re-exports to reference contract enums/types within backend without circular build tooling yet.
export enum Mode {
  PLEDGE = 0,
  FINALIZE = 1,
  REFUND = 2,
}
