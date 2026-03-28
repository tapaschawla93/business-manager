import {
  LayoutDashboard,
  Package2,
  ShoppingCart,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

/** Primary shell nav (desktop sidebar + mobile bottom bar). */
export const MAIN_NAV_ITEMS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/products', label: 'Products', Icon: Package2 },
  { href: '/sales', label: 'Sales', Icon: ShoppingCart },
  { href: '/expenses', label: 'Expenses', Icon: Wallet },
  { href: '/vendors', label: 'Vendors', Icon: Truck },
  { href: '/inventory', label: 'Inventory', Icon: Warehouse },
];

export function isMainNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
