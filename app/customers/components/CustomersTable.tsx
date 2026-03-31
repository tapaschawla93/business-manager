'use client';

import { formatInrDisplay } from '@/lib/formatInr';
import { MoreVertical } from 'lucide-react';
import type { CustomerListRow } from '@/lib/types/customer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Props = {
  rows: CustomerListRow[];
  onOpen: (row: CustomerListRow) => void;
  onEdit: (row: CustomerListRow) => void;
  onDelete: (row: CustomerListRow) => void;
  onCreate: (row: CustomerListRow) => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

export function CustomersTable({ rows, onOpen, onEdit, onDelete, onCreate }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Order Count</TableHead>
          <TableHead>Total Spent</TableHead>
          <TableHead>Last Order Date</TableHead>
          <TableHead className="w-[56px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const repeat = row.orderCount >= 2;
          return (
            <TableRow
              key={row.id}
              onClick={() => onOpen(row)}
              className={`cursor-pointer ${repeat ? 'bg-[#f0fdf4] hover:bg-[#e5f8ea]' : ''}`}
            >
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>{row.phone ?? '-'}</TableCell>
              <TableCell>{row.orderCount}</TableCell>
              <TableCell>{formatInrDisplay(row.totalSpent)}</TableCell>
              <TableCell>{formatDate(row.lastOrderDate)}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button type="button" variant="ghost" size="icon" aria-label="Row actions">
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      disabled={!row.customerId}
                      onSelect={(e) => {
                        e.preventDefault();
                        onEdit(row);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!!row.customerId}
                      onSelect={(e) => {
                        e.preventDefault();
                        onCreate(row);
                      }}
                    >
                      Create Record
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!row.customerId}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      onSelect={(e) => {
                        e.preventDefault();
                        onDelete(row);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
