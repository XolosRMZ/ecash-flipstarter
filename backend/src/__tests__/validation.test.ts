import { describe, expect, it } from 'vitest';
import { validateAddress, validateHex } from '../utils/validation';

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

describe('validateAddress', () => {
  const payload = 'qpjm4qgv50v5vc6dpf6nu0w0epp8tzdn7gt0e06ssk';
  const bchPayload = 'qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';

  it('accepts ecash: prefix', () => {
    expect(validateAddress(`ecash:${payload}`, 'contributorAddress')).toBe(
      `ecash:${payload}`,
    );
  });

  it('accepts no prefix and normalizes to ecash:', () => {
    expect(validateAddress(payload, 'beneficiaryAddress')).toBe(
      `ecash:${payload}`,
    );
  });

  it('accepts bitcoincash: prefix and normalizes to ecash:', () => {
    expect(
      validateAddress(`bitcoincash:${bchPayload}`, 'contributorAddress'),
    ).toBe(
      `ecash:${bchPayload}`,
    );
  });

  it('rejects garbage with field-invalid', () => {
    expect(() => validateAddress('not-an-address', 'beneficiaryAddress')).toThrow(
      'beneficiaryAddress-invalid',
    );
  });
});
