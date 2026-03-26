import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AppChrome } from '@/components/layout/AppChrome';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'BizManager',
  description: 'Multi-tenant business operations',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
