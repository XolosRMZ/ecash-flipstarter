import express from 'express';
import campaignsRouter from './routes/campaigns.routes';
import pledgeRouter from './routes/pledge.routes';
import finalizeRouter from './routes/finalize.routes';
import refundRouter from './routes/refund.routes';
import { CHRONIK_BASE_URL, ECASH_BACKEND, USE_CHRONIK } from './config/ecash';
import { getChronikBlockchainInfo, rpcCall } from './blockchain/ecashClient';

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
// CORS muy abierto para desarrollo
app.use((req, res, next) => {
  res.header(
    'Access-Control-Allow-Origin',
    allowedOrigin === '*' ? '*' : allowedOrigin
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});


app.use(express.json());

// Healthchecks
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', async (_req, res) => {
  try {
    if (USE_CHRONIK) {
      try {
        const chainInfo = await getChronikBlockchainInfo();
        res.json({
          status: 'ok',
          backendMode: ECASH_BACKEND,
          chronikBaseUrl: CHRONIK_BASE_URL,
          tipHeight: chainInfo.tipHeight,
        });
        return;
      } catch (err) {
        res.status(500).json({
          status: 'error',
          backendMode: ECASH_BACKEND,
          chronikBaseUrl: CHRONIK_BASE_URL,
          error: (err as Error).message,
        });
        return;
      }
    }
    const info = await rpcCall<any>('getblockchaininfo');
    res.json({
      status: 'ok',
      backendMode: ECASH_BACKEND,
      network: info.chain || 'XEC',
      blocks: info.blocks,
      headers: info.headers,
      bestHash: info.bestblockhash?.slice(0, 8) ?? null,
      timestamp: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

// Rutas de la API
app.use('/api', campaignsRouter);
app.use('/api', pledgeRouter);
app.use('/api', finalizeRouter);
app.use('/api', refundRouter);

export default app;
