import { describe, expect, it } from 'vitest';
import { customerPhoneDedupeKey, normalizePhoneDigits } from '@/lib/queries/customers';

describe('normalizePhoneDigits', () => {
  it('strips non-digits and merges +91 / local 10-digit', () => {
    expect(normalizePhoneDigits('98765 43210')).toBe('9876543210');
    expect(normalizePhoneDigits('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhoneDigits('098765 43210')).toBe('9876543210');
  });

  it('returns null for empty or too-short input', () => {
    expect(normalizePhoneDigits(null)).toBeNull();
    expect(normalizePhoneDigits('')).toBeNull();
    expect(normalizePhoneDigits('12345')).toBeNull();
  });
});

describe('customerPhoneDedupeKey', () => {
  it('uses normalized digits when possible so import formats collapse', () => {
    expect(customerPhoneDedupeKey('98765 43210')).toBe('9876543210');
    expect(customerPhoneDedupeKey('+91 98765 43210')).toBe('9876543210');
    expect(customerPhoneDedupeKey('098765 43210')).toBe('9876543210');
  });

  it('returns empty string for missing phone', () => {
    expect(customerPhoneDedupeKey(null)).toBe('');
    expect(customerPhoneDedupeKey('   ')).toBe('');
  });

  it('falls back to trimmed raw when normalization fails (short codes)', () => {
    expect(customerPhoneDedupeKey('  12345  ')).toBe('12345');
  });
});
