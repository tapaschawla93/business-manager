'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import type { TopProductRow, TopProductVolumeRow } from '@/lib/queries/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function renderMargin(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct.toFixed(2)}%`;
}

function formatQty(q: number): string {
  const t = q.toFixed(3).replace(/\.?0+$/, '');
  return t === '' ? '0' : t;
}

export function TopProductsTable({
  topByRevenue,
  topByMargin,
  topByVolume,
}: {
  topByRevenue: TopProductRow[];
  topByMargin: TopProductRow[];
  topByVolume: TopProductVolumeRow[];
}) {
  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader className="p-4 pb-2 md:p-6">
          <CardTitle className="ui-section-title text-sm md:text-base">Top products by revenue</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3 pt-0 md:px-6 md:pb-6">
          <Table className="text-xs md:text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:h-10 [&_th]:px-3 [&_th]:py-2 md:[&_td]:px-6 md:[&_td]:py-4 md:[&_th]:h-12 md:[&_th]:px-6 md:[&_th]:py-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByRevenue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data yet
                  </TableCell>
                </TableRow>
              ) : (
                topByRevenue.map((r, i) => (
                  <TableRow key={r.product_id}>
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{renderMargin(r.avg_margin_pct)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2 md:p-6">
          <CardTitle className="ui-section-title text-sm md:text-base">Top products by profit margin %</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3 pt-0 md:px-6 md:pb-6">
          <Table className="text-xs md:text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:h-10 [&_th]:px-3 [&_th]:py-2 md:[&_td]:px-6 md:[&_td]:py-4 md:[&_th]:h-12 md:[&_th]:px-6 md:[&_th]:py-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByMargin.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data yet
                  </TableCell>
                </TableRow>
              ) : (
                topByMargin.map((r, i) => (
                  <TableRow key={r.product_id}>
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{renderMargin(r.avg_margin_pct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(r.revenue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2 md:p-6">
          <CardTitle className="ui-section-title text-sm md:text-base">Top products by units sold</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3 pt-0 md:px-6 md:pb-6">
          <Table className="text-xs md:text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:h-10 [&_th]:px-3 [&_th]:py-2 md:[&_td]:px-6 md:[&_td]:py-4 md:[&_th]:h-12 md:[&_th]:px-6 md:[&_th]:py-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByVolume.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No data yet
                  </TableCell>
                </TableRow>
              ) : (
                topByVolume.map((r, i) => (
                  <TableRow key={r.product_id}>
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(r.quantity_sold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(r.revenue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
