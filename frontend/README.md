# Flipstarter 2.0 Frontend

Simple React/Vite UI to request unsigned covenant transactions from the backend.

## Setup
```
npm install
```

Prefer `.env.local` for dev overrides (see `.env.local.example`), `.env` for production defaults.

Set API base URL (defaults to http://localhost:3001/api):
```
export VITE_API_BASE_URL=http://localhost:3001/api
```

## Run
```
npm run dev
```

## Flow
- Create a campaign via curl or future UI.
- Open the frontend and navigate to a campaign.
- Use the pledge form to request an unsigned pledge transaction.
- Copy `unsignedTxHex` into a wallet for signing and broadcast via the backend.

## Tonalli Connector
Set these env vars to enable the in-app Tonalli signing flow:
```
export VITE_TONALLI_BRIDGE_URL=https://cartera.xolosarmy.xyz
export VITE_TONALLI_BRIDGE_ORIGIN=https://cartera.xolosarmy.xyz
export VITE_TONALLI_BRIDGE_PATH=/#/external-sign
export VITE_TONALLI_TIMEOUT_MS=120000
```

Local dev defaults:
```
VITE_API_BASE_URL=http://127.0.0.1:3001/api
VITE_TONALLI_BASE_URL=http://127.0.0.1:5174
```

The Tonalli callback URL resolves from the runtime origin (`window.location.origin + "/#/tonalli-callback"`)
unless `VITE_TONALLI_CALLBACK_URL` is explicitly set.

Test flow:
1) Build a pledge to get the unsigned hex.
2) Click "Sign & Broadcast with Tonalli".
3) Approve in Tonalli and confirm the returned txid in the UI.
