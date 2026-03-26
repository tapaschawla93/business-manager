import type { ReactNode } from 'react';
import { AppChrome } from '@/components/layout/AppChrome';
import './globals.css';

export const metadata = {
  title: 'BizManager',
  description: 'Multi-tenant business operations',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
