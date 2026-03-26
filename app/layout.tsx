import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AppChrome } from '@/components/layout/AppChrome';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'BizManager — Business OS',
  description: 'Sales, inventory, expenses, and vendor operations in one workspace.',
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
