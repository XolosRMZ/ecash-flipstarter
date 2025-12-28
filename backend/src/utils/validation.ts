import { Address } from '@ecash/lib';
import { isValidCashAddress } from 'ecashaddrjs';

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
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new Error(`${field}-required`);
  }

  const lower = trimmed.toLowerCase();
  let prefix = '';
  let payload = lower;
  const separatorIndex = lower.indexOf(':');
  const hasPrefix = separatorIndex > 0;

  if (hasPrefix) {
    prefix = lower.slice(0, separatorIndex);
    payload = lower.slice(separatorIndex + 1);
  }

  const candidates: string[] = [];

  if (hasPrefix) {
    candidates.push(lower);
    if (prefix === 'ecash' || prefix === 'etoken') {
      candidates.push(`bitcoincash:${payload}`);
    }
    if (prefix === 'bitcoincash') {
      candidates.push(`ecash:${payload}`);
    }
  } else {
    candidates.push(`ecash:${payload}`);
    candidates.push(`bitcoincash:${payload}`);
  }

  for (const candidate of candidates) {
    try {
      Address.parse(candidate);
      return `ecash:${payload}`;
    } catch {
      if (isValidCashAddress(candidate)) {
        return `ecash:${payload}`;
      }
    }
  }

  throw new Error(`${field}-invalid`);
}
