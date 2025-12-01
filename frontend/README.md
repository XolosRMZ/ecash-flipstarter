# Flipstarter 2.0 Frontend

Simple React/Vite UI to request unsigned covenant transactions from the backend.

## Setup
```
npm install
```

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
- Copy `rawHex` into a wallet for signing (Tonalli integration TODO).
