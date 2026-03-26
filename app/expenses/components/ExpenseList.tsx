'use client';

import { Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { formatInrDisplay } from '@/lib/formatInr';
import type { Expense } from '@/lib/types/expense';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ExpenseList({
  expenses,
  loading,
  onEdit,
  onArchive,
  onRefresh,
}: {
  expenses: Expense[];
  loading: boolean;
  onEdit: (row: Expense) => void;
  onArchive: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-base font-semibold">All expenses</h3>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses yet. Add one with the button above or +.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateShort(row.date)}
                  </TableCell>
                  <TableCell className="font-medium">{row.vendor_name}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{row.item_description}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatInrDisplay(Number(row.total_amount))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.payment_mode === 'online' ? 'outline' : 'muted'}>
                      {row.payment_mode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Edit"
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        aria-label="Archive"
                        onClick={() => onArchive(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
