import express from 'express';
import campaignsRouter from './routes/campaigns.routes';
import pledgeRouter from './routes/pledge.routes';
import finalizeRouter from './routes/finalize.routes';
import refundRouter from './routes/refund.routes';

const app = express();

// CORS muy abierto para desarrollo
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
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

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    network: 'XEC',
    timestamp: Date.now(),
  });
});

// Rutas de la API
app.use('/api', campaignsRouter);
app.use('/api', pledgeRouter);
app.use('/api', finalizeRouter);
app.use('/api', refundRouter);

export default app;

