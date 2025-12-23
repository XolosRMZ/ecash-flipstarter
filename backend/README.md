# Flipstarter Backend

Express + TypeScript backend scaffold for Flipstarter 2.0. Provides campaign, pledge, finalize, and refund APIs backed by covenant transactions on eCash.

## Configuration

Chronik mode uses the base URL (no `/xec` suffix), for example:

```
CHRONIK_BASE_URL=https://chronik.e.cash
```

API server settings:

```
API_PORT=3001
HOST=127.0.0.1
```

Quick checks (Chronik mode):

```
E_CASH_BACKEND=chronik CHRONIK_BASE_URL=https://chronik.e.cash curl -s http://127.0.0.1:3001/api/health | cat
```

Optional UTXO check (if debug route exists):

```
curl -s "http://127.0.0.1:3001/api/debug/utxos?address=ecash:qqa4zjj0mt6gkm3uh6wcmxtzdr3p6f7cky4y7vujuw" | cat
```
