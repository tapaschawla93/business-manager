'use client';

import { Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { formatInrDisplay } from '@/lib/formatInr';
import type { Expense } from '@/lib/types/expense';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
    <Card className="overflow-hidden border-border/80 shadow-md">
      <CardContent className="p-0">
        <div className="flex items-center justify-end border-b border-border/60 px-4 py-2">
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg font-medium" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No expenses yet</p>
            <p className="text-sm text-muted-foreground">Add purchases with New expense or the + button.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                  <TableHead className="ui-table-head py-4">Date</TableHead>
                  <TableHead className="ui-table-head py-4">Vendor</TableHead>
                  <TableHead className="ui-table-head py-4">Item</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Units</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Amount</TableHead>
                  <TableHead className="ui-table-head py-4">Payment</TableHead>
                  <TableHead className="ui-table-head py-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((row) => (
                  <TableRow key={row.id} className="border-border/50">
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateShort(row.date)}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{row.vendor_name}</TableCell>
                    <TableCell className="max-w-[140px] truncate text-sm">{row.item_description}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.quantity}</TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums">
                      {formatInrDisplay(Number(row.total_amount))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.payment_mode === 'online'
                            ? 'border-primary/25 bg-primary/5 font-semibold text-primary'
                            : 'font-semibold'
                        }
                      >
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
