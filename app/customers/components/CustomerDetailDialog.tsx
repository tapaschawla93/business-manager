'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import type { CustomerListRow, CustomerOrderHistoryRow } from '@/lib/types/customer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: CustomerListRow | null;
  orders: CustomerOrderHistoryRow[];
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

export function CustomerDetailDialog({ open, onOpenChange, customer, orders }: Props) {
  if (!customer) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription>
            Phone: {customer.phone ?? '-'} · Address: {customer.address ?? '-'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 p-3 text-sm md:grid-cols-3">
          <p>
            <span className="font-semibold">Total orders:</span> {customer.orderCount}
          </p>
          <p>
            <span className="font-semibold">Total spent:</span> {formatInrDisplay(customer.totalSpent)}
          </p>
          <p>
            <span className="font-semibold">Last order:</span> {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : '-'}
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Customer Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.saleId}>
                <TableCell>{formatDate(o.date)}</TableCell>
                <TableCell>{formatInrDisplay(o.amount)}</TableCell>
                <TableCell className="capitalize">{o.paymentMode}</TableCell>
                <TableCell>{o.customerName ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
