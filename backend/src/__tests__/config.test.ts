import { describe, expect, it } from 'vitest';
import { normalizeChronikBaseUrl } from '../config/ecash';

describe('normalizeChronikBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeChronikBaseUrl('  https://chronik.e.cash/xec/  ')).toBe(
      'https://chronik.e.cash/xec'
    );
  });

  it('keeps bases without /xec', () => {
    expect(normalizeChronikBaseUrl('https://chronik.e.cash')).toBe(
      'https://chronik.e.cash'
    );
  });

  it('returns empty for whitespace-only input', () => {
    expect(normalizeChronikBaseUrl('   ')).toBe('');
  });
});
