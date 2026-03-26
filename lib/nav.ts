import { LayoutDashboard, Package2, Receipt, Wallet, Settings, type LucideIcon } from 'lucide-react';

/** Single source for sidebar + mobile bottom nav (Phase A). */
export const MAIN_NAV_ITEMS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/products', label: 'Products', Icon: Package2 },
  { href: '/sales', label: 'Sales', Icon: Receipt },
  { href: '/expenses', label: 'Expenses', Icon: Wallet },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

export function isMainNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
