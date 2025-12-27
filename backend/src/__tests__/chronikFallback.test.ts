import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

function createResponse(status: number, body: any): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

beforeEach(() => {
  vi.resetModules();
  process.env.E_CASH_BACKEND = 'chronik';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chronik blockchain info fallback', () => {
  it('falls back to base without /xec when /xec returns 404', async () => {
    process.env.CHRONIK_BASE_URL = 'https://chronik.example/xec';
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://chronik.example/xec/blockchain-info') {
        return Promise.resolve(createResponse(404, {}));
      }
      if (url === 'https://chronik.example/blockchain-info') {
        return Promise.resolve(createResponse(200, { tipHeight: 42 }));
      }
      return Promise.resolve(createResponse(500, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getTipHeight, getEffectiveChronikBaseUrl } = await import(
      '../blockchain/ecashClient'
    );

    const tipHeight = await getTipHeight();

    expect(tipHeight).toBe(42);
    expect(getEffectiveChronikBaseUrl()).toBe('https://chronik.example');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to /xec when base without suffix returns 404', async () => {
    process.env.CHRONIK_BASE_URL = 'https://chronik.example';
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://chronik.example/blockchain-info') {
        return Promise.resolve(createResponse(404, {}));
      }
      if (url === 'https://chronik.example/xec/blockchain-info') {
        return Promise.resolve(createResponse(200, { tipHeight: 99 }));
      }
      return Promise.resolve(createResponse(500, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getTipHeight, getEffectiveChronikBaseUrl } = await import(
      '../blockchain/ecashClient'
    );

    const tipHeight = await getTipHeight();

    expect(tipHeight).toBe(99);
    expect(getEffectiveChronikBaseUrl()).toBe('https://chronik.example/xec');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
