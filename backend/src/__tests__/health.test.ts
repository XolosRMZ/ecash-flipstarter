import { describe, expect, it, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  process.env.E_CASH_BACKEND = 'chronik';
  process.env.CHRONIK_BASE_URL = 'https://chronik.example/xec';
  process.env.ALLOWED_ORIGIN = '*';
});

vi.mock('../blockchain/ecashClient', () => ({
  getTipHeight: vi.fn().mockResolvedValue(123),
  getEffectiveChronikBaseUrl: vi.fn().mockReturnValue('https://chronik.example/xec'),
}));

describe('/api/health', () => {
  it('returns chronik health shape with tipHeight', async () => {
    const { healthHandler } = await import('../app');
    const res = createMockRes();
    await healthHandler({} as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      backendMode: 'chronik',
      chronikBaseUrl: 'https://chronik.example/xec',
      tipHeight: 123,
    });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    header(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}
