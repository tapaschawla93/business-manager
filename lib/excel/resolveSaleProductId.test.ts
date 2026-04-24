import { describe, expect, it } from 'vitest';
import {
  normalizeProductNameKey,
  resolveSaleProductId,
} from '@/lib/excel/resolveSaleProductId';

describe('normalizeProductNameKey', () => {
  it('collapses case and spaces', () => {
    expect(normalizeProductNameKey('  Vermi   Compost  ')).toBe('vermi compost');
  });
});

describe('resolveSaleProductId', () => {
  const idFromName = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const map = new Map<string, string>([
    ['sample product', idFromName],
    ['vc50', '11111111-2222-4333-8444-555555555555'],
  ]);

  it('accepts valid UUID in product_id', () => {
    const r = resolveSaleProductId(
      { product_id: idFromName, product_name: '' },
      map,
    );
    expect(r).toEqual({ ok: true, productId: idFromName });
  });

  it('resolves product_name via map', () => {
    const r = resolveSaleProductId({ product_id: '', product_name: 'Sample Product' }, map);
    expect(r).toEqual({ ok: true, productId: idFromName });
  });

  it('prefers UUID when both set', () => {
    const r = resolveSaleProductId(
      {
        product_id: '99999999-9999-4999-a999-999999999999',
        product_name: 'Sample Product',
      },
      map,
    );
    expect(r).toEqual({ ok: true, productId: '99999999-9999-4999-a999-999999999999' });
  });

  it('errors on unknown name', () => {
    const r = resolveSaleProductId({ product_name: 'Nope' }, map);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Unknown product_name');
  });

  it('errors on invalid uuid string', () => {
    const r = resolveSaleProductId({ product_id: 'not-a-uuid' }, map);
    expect(r.ok).toBe(false);
  });
});
