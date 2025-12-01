# Flipstarter 2.0 API

Base path: `/api`

## POST /api/campaign
- Body: `{ name, description, goal, expirationTime, beneficiaryAddress }`
- Response: `{ campaignId, scriptHash, scriptHex, covenant: { txid, vout, value, scriptHash, scriptPubKey } }`

## GET /api/campaign/:id
- Response: metadata + `covenant` reference + `progress` (value/goal when available).

## POST /api/campaign/:id/pledge
- Body: `{ contributorAddress, amount }`
- Response: `{ unsignedTx, rawHex }` (unsigned transaction) plus any fee/change metadata if available.

## POST /api/campaign/:id/finalize
- Body: `{ beneficiaryAddress? }` (optional override if allowed)
- Response: `{ unsignedTx, rawHex }` (unsigned transaction to beneficiary).

## POST /api/campaign/:id/refund
- Body: `{ refundAddress, refundAmount }`
- Response: `{ unsignedTx, rawHex }` (unsigned refund transaction).

## Examples

Create a campaign:
```bash
curl -X POST http://localhost:3001/api/campaign \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Demo Campaign",
    "description": "Test covenant crowdfunding",
    "goal": 100000000,
    "expirationTime": 1735689600,
    "beneficiaryAddress": "bitcoincash:qq..."
  }'
```

Create a pledge tx:
```bash
curl -X POST http://localhost:3001/api/campaign/campaign-123/pledge \
  -H 'Content-Type: application/json' \
  -d '{
    "contributorAddress": "bitcoincash:qr...",
    "amount": 50000
  }'
```

### Chronik backend
For development you can set `E_CASH_BACKEND=chronik` and optionally `CHRONIK_BASE_URL` (default `https://chronik.e.cash/xec`). In this mode:
- UTXOs come from `GET {CHRONIK_BASE_URL}/address/{addr}/utxos`.
- Transactions broadcast via `POST {CHRONIK_BASE_URL}/tx` with raw hex body.
