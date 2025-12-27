import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';

beforeEach(() => {
  vi.resetModules();
  process.env.E_CASH_BACKEND = 'chronik';
  process.env.CHRONIK_BASE_URL = 'https://chronik.example/xec';
});

vi.mock('../blockchain/ecashClient', () => ({
  getTipHeight: vi.fn().mockResolvedValue(123),
}));

describe('/api/health', () => {
  it('returns chronik health shape with tipHeight', async () => {
    const { default: app } = await import('../app');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      backendMode: 'chronik',
      chronikBaseUrl: 'https://chronik.example/xec',
      tipHeight: 123,
    });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
