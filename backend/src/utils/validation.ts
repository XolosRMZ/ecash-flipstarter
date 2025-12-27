import { Address } from '@ecash/lib';

export const HEX_PATTERN = /^[0-9a-fA-F]+$/;
const MIN_HEX_LENGTH = 20;

export function validateHex(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('rawTxHex-required');
  }
  if (!HEX_PATTERN.test(trimmed)) {
    throw new Error('rawTxHex-invalid-characters');
  }
  if (trimmed.length % 2 !== 0) {
    throw new Error('rawTxHex-invalid-length');
  }
  if (trimmed.length < MIN_HEX_LENGTH) {
    throw new Error('rawTxHex-too-short');
  }
  return trimmed;
}

export function validateAddress(raw: string, field: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${field}-required`);
  }
  try {
    Address.parse(trimmed);
  } catch (err) {
    throw new Error(`${field}-invalid`);
  }
  return trimmed;
}
