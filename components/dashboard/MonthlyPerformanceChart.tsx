'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatInrDisplay } from '@/lib/formatInr';
import type { MonthlyPerformanceRow } from '@/lib/queries/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Props = {
  rows: MonthlyPerformanceRow[];
  /** Legend / tooltip label for the red bar (`dataKey` stays `expenses`). */
  counterpartyBarName?: string;
};

function monthLabel(month: number, year: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-IN', { month: 'short' });
}

export function MonthlyPerformanceChart({
  rows,
  counterpartyBarName = 'Expenses',
}: Props) {
  const chartRows = rows.map((r) => ({
    label: monthLabel(r.month, r.year),
    revenue: r.revenue,
    expenses: r.expenses,
    profit: r.profit,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">Monthly Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Tooltip formatter={(value) => formatInrDisplay(Number(value ?? 0))} />
              <Legend />
              <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar
                name={counterpartyBarName}
                dataKey="expenses"
                fill="#dc2626"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="profit" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
