import {
  LayoutDashboard,
  Package2,
  Receipt,
  Wallet,
  Settings,
  Warehouse,
  Truck,
  type LucideIcon,
} from 'lucide-react';

/** Single source for sidebar + mobile bottom nav. */
export const MAIN_NAV_ITEMS: ReadonlyArray<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/products', label: 'Products', Icon: Package2 },
  { href: '/inventory', label: 'Inventory', Icon: Warehouse },
  { href: '/sales', label: 'Sales', Icon: Receipt },
  { href: '/expenses', label: 'Expenses', Icon: Wallet },
  { href: '/vendors', label: 'Vendors', Icon: Truck },
  { href: '/settings', label: 'Settings', Icon: Settings },
];

export function isMainNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
