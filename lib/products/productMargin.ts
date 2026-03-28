import type { Product } from '@/lib/types/product';

/** UI margin from MRP & cost (catalog); not stored in DB. */
export type ProductMarginTone = 'good' | 'warn' | 'bad' | 'na';

export function getProductMargin(p: Product): { label: string; tone: ProductMarginTone } {
  const cost = Number(p.cost_price);
  if (!Number.isFinite(cost) || cost <= 0) return { label: '—', tone: 'na' };
  const mrp = Number(p.mrp);
  if (!Number.isFinite(mrp)) return { label: '—', tone: 'na' };
  const pct = ((mrp - cost) / cost) * 100;
  const tone: ProductMarginTone = pct > 30 ? 'good' : pct >= 10 ? 'warn' : 'bad';
  return { label: `${pct.toFixed(1)}%`, tone };
}

export function productMarginToneClass(tone: ProductMarginTone): string {
  if (tone === 'good') return 'text-finance-positive';
  if (tone === 'warn') return 'text-amber-600';
  if (tone === 'bad') return 'text-finance-negative';
  return 'text-muted-foreground';
}
