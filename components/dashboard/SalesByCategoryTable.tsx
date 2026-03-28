'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import type { CategorySalesRow } from '@/lib/queries/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Revenue by `products.category` for the dashboard range; deleted products excluded in RPC. */
export function SalesByCategoryTable({ rows }: { rows: CategorySalesRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="ui-section-title">Sales by category</CardTitle>
        <p className="text-xs font-normal text-muted-foreground">Active products only (excludes archived).</p>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No data in this range
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <TableRow key={`${r.category}-${i}`}>
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatInrDisplay(r.revenue)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
