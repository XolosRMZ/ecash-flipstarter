import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

beforeEach(() => {
  vi.resetModules();
  process.env.E_CASH_BACKEND = 'chronik';
  process.env.CHRONIK_BASE_URL = 'https://chronik.example/xec';
});

vi.mock('../blockchain/ecashClient', () => ({
  broadcastTx: vi.fn().mockResolvedValue({ txid: 'mock-txid' }),
}));

describe('/api/tx/broadcast', () => {
  it('broadcasts a signed tx hex', async () => {
    const { default: app } = await import('../app');
    const res = await request(app)
      .post('/api/tx/broadcast')
      .send({ rawTxHex: '00'.repeat(10) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      txid: 'mock-txid',
      backendMode: 'chronik',
      message: 'broadcasted',
    });
  });
});
