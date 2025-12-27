import { describe, expect, it } from 'vitest';
import { validateHex } from '../utils/validation';

describe('validateHex', () => {
  it('accepts valid hex', () => {
    expect(validateHex('00'.repeat(10))).toBe('00'.repeat(10));
  });

  it('rejects empty hex', () => {
    expect(() => validateHex('')).toThrow('rawTxHex-required');
  });

  it('rejects non-hex chars', () => {
    expect(() => validateHex('zz11')).toThrow('rawTxHex-invalid-characters');
  });
});
