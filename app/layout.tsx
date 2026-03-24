import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Business Manager',
  description: 'Multi-tenant business operations',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-4 sm:max-w-5xl">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">Business Manager</span>
            <nav className="flex gap-3 text-sm text-slate-600">
              <a href="/" className="hover:text-slate-900">
                Home
              </a>
              <a href="/login" className="hover:text-slate-900">
                Login
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
