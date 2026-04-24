import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Import, backup & restore"
        description="Each module has a ⋮ menu: download its CSV template and upload filled data. Dashboard only exports a full backup workbook and can restore from that file."
      />

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-6 p-5 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Workbook import order (Dashboard Restore)</h2>
            <p className="text-muted-foreground">
              Sheets are applied in this order. Each insert is its own commit — an error on a later sheet does not undo
              earlier sheets.
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-foreground">
              <li>Products</li>
              <li>Inventory</li>
              <li>Customers</li>
              <li>Vendors</li>
              <li>
                Sales (one row per sold line; <code className="rounded bg-muted px-1 text-xs">product_id</code> from backup
                or <code className="rounded bg-muted px-1 text-xs">product_name</code> matching Products)
              </li>
              <li>Expenses</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Per-module CSV</h2>
            <p className="text-muted-foreground">
              Columns match each page&apos;s template. Import affects only that entity type (use Restore for a full
              snapshot).
            </p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {[
                { href: '/products', label: 'Products' },
                { href: '/inventory', label: 'Inventory' },
                { href: '/customers', label: 'Customers' },
                { href: '/vendors', label: 'Vendors' },
                { href: '/sales', label: 'Sales' },
                { href: '/expenses', label: 'Expenses' },
              ].map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="font-semibold text-primary underline-offset-4 hover:underline">
                    {x.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Backup &amp; Restore</h2>
            <p className="text-muted-foreground">
              <strong>Export backup</strong> on the dashboard downloads an <code className="rounded bg-muted px-1 text-xs">.xlsx</code> that matches the import pipeline.
              <strong> Restore</strong> reads that file the same way: rows merge with your current data (duplicate keys are skipped;
              nothing is wiped automatically). The <strong>Inventory Ledger</strong> tab is informational and is not imported.
            </p>
            <p className="text-muted-foreground">
              Sale &amp; expense tags and defaults:{' '}
              <Link href="/settings" className="font-semibold text-primary underline-offset-4 hover:underline">
                Settings
              </Link>
              .
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
