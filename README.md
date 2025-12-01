# Flipstarter 2.0 – Covenant-based Crowdfunding on eCash (XEC)

Monorepo for a covenant-driven crowdfunding system on eCash. Contracts, backend services, and frontend UI live here.

## Quickstart
1. Run an eCash node with RPC enabled.
2. Copy and edit `backend/.env.example` to `backend/.env` with RPC creds.
3. Backend:
   ```
   cd backend
   npm install
   npm run dev
   ```
4. Frontend:
   ```
   cd frontend
   npm install
   export VITE_API_BASE_URL=http://localhost:3001/api
   npm run dev
   ```

## Flow
- Create a campaign via `POST /api/campaign`.
- Fetch campaign details via `GET /api/campaign/:id`.
- Build pledge/finalize/refund unsigned txs via respective POST routes.
- Sign and broadcast with a wallet (Tonalli/RMZWallet planned); backend only returns UNSIGNED tx hex.

## Docs
- Whitepaper placeholder: `docs/whitepaper/crowdfunding-covenant-xec-es.md`
- UTXO state machine: `docs/diagrams/utxo-state-machine.md`
- API reference: `docs/api.md`
