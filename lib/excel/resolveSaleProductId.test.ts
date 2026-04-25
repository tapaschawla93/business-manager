import { describe, expect, it } from 'vitest';
import {
  normalizeProductNameKey,
  saleProductLookupKey,
  resolveSaleProductId,
} from '@/lib/excel/resolveSaleProductId';

describe('normalizeProductNameKey', () => {
  it('collapses case and spaces', () => {
    expect(normalizeProductNameKey('  Vermi   Compost  ')).toBe('vermi compost');
  });
});

describe('resolveSaleProductId', () => {
  const idFromName = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const byNameVariant = new Map<string, string>([
    [saleProductLookupKey('Sample Product', ''), idFromName],
    [saleProductLookupKey('VC50', ''), '11111111-2222-4333-8444-555555555555'],
    [saleProductLookupKey('Tea', '100g'), '66666666-2222-4333-8444-555555555555'],
    [saleProductLookupKey('Tea', '200g'), '77777777-2222-4333-8444-555555555555'],
  ]);
  const uniqueByName = new Map<string, string>([
    ['sample product', idFromName],
    ['vc50', '11111111-2222-4333-8444-555555555555'],
  ]);
  const context = { productIdByNameVariant: byNameVariant, uniqueProductIdByName: uniqueByName };

  it('accepts valid UUID in product_id', () => {
    const r = resolveSaleProductId(
      { product_id: idFromName, product_name: '' },
      context,
    );
    expect(r).toEqual({ ok: true, productId: idFromName });
  });

  it('resolves product_name via map', () => {
    const r = resolveSaleProductId({ product_id: '', product_name: 'Sample Product' }, context);
    expect(r).toEqual({ ok: true, productId: idFromName });
  });

  it('resolves product_name + variant via map', () => {
    const r = resolveSaleProductId({ product_id: '', product_name: 'Tea', variant: '200g' }, context);
    expect(r).toEqual({ ok: true, productId: '77777777-2222-4333-8444-555555555555' });
  });

  it('prefers UUID when both set', () => {
    const r = resolveSaleProductId(
      {
        product_id: '99999999-9999-4999-a999-999999999999',
        product_name: 'Sample Product',
      },
      context,
    );
    expect(r).toEqual({ ok: true, productId: '99999999-9999-4999-a999-999999999999' });
  });

  it('errors on unknown name', () => {
    const r = resolveSaleProductId({ product_name: 'Nope' }, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('missing or ambiguous');
  });

  it('errors on ambiguous name when variant missing', () => {
    const r = resolveSaleProductId({ product_name: 'Tea' }, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('variant');
  });

  it('errors on invalid uuid string', () => {
    const r = resolveSaleProductId({ product_id: 'not-a-uuid' }, context);
    expect(r.ok).toBe(false);
  });
});
