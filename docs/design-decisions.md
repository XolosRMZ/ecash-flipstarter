# Design Decisions (ADR-style Notes)

- Use recursive covenant UTXO instead of mega transaction; enables independent pledges without ANYONECANPAY.
- Introspection opcodes are required to inspect outputs for covenant continuity and beneficiary payouts.
- 64-bit integers are used for goal and expiry to align with eCash consensus.
- Refund path does not constrain refund recipient for MVP; identity enforcement can be added later.
- Backend builds unsigned transactions; wallets sign locally to remain non-custodial.

## Backend plumbing (RPC + signing model)
- Transaction construction now uses @ecash/lib placeholders plus JSON-RPC via `ecashClient.ts`; RPC credentials are read from env (`E_CASH_RPC_*`/`ECASH_RPC_*`).
- CovenantIndex remains an in-memory map; TODO: swap for persistent DB or Chronik/indexer-backed source of truth.
- All transactions returned by the API are UNSIGNED. Client wallets (e.g., Tonalli/RMZWallet) must sign inputs and broadcast; backend only assists with construction.

## Chronik backend option
- Set `E_CASH_BACKEND=chronik` and `CHRONIK_BASE_URL=https://chronik.e.cash` (default, append `/xec` if your proxy requires it) to fetch UTXOs via `/script/{type}/{hash}/utxos` and broadcast via `/broadcast-tx` on Chronik.
- Leave unset or `rpc` to use node JSON-RPC as before; covenant logic and txBuilder are unchanged, only the UTXO/broadcast backend switches.
