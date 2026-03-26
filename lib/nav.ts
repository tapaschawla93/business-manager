import {
  LayoutDashboard,
  Package2,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** V1 navigation only — Inventory, Vendors, Settings hidden from main nav (routes still exist). */
export const MAIN_NAV_ITEMS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/sales', label: 'Sales', Icon: ShoppingCart },
  { href: '/expenses', label: 'Expenses', Icon: Wallet },
  { href: '/products', label: 'Products', Icon: Package2 },
];

export function isMainNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
