'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getDashboardKPIs, getTopProducts } from '@/lib/queries/dashboard';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { TopProductsTable } from '@/components/dashboard/TopProductsTable';
import {
  BarChart3,
  HandCoins,
  Receipt,
  Wallet,
  TrendingUp,
  CircleDollarSign,
  ChartLine,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kpis, setKpis] = useState<{
    total_revenue: number;
    total_expenses: number;
    inventory_value: number;
    gross_profit: number;
    cash_in_hand: number;
    online_received: number;
    sales_count: number;
    average_sale_value: number;
  } | null>(null);
  const [topProducts, setTopProducts] = useState<{
    top_by_revenue: Array<{
      product_id: string;
      label: string;
      revenue: number;
      avg_margin_pct: number | null;
    }>;
    top_by_margin: Array<{
      product_id: string;
      label: string;
      revenue: number;
      avg_margin_pct: number | null;
    }>;
  } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const hasSession = Boolean(data.session);
      setIsAuthenticated(hasSession);
      setCheckingSession(false);

      if (!hasSession) {
        router.replace('/login');
      }
    }

    checkSession();
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const supabase = getSupabaseClient();
    setLoadingDashboard(true);
    setError(null);

    Promise.all([getDashboardKPIs(supabase), getTopProducts(supabase)])
      .then(([kpiRes, topRes]) => {
        if (kpiRes.error) throw kpiRes.error;
        if (topRes.error) throw topRes.error;

        setKpis(kpiRes.data);
        setTopProducts(topRes.data);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Failed to load dashboard';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoadingDashboard(false));
  }, [isAuthenticated]);

  if (checkingSession) {
    return <p className="ui-page-description">Checking session…</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (loadingDashboard) {
    return <p className="ui-page-description">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Operating summary: revenue, spend, stock at cost, and net cash position."
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {kpis ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              icon={<ChartLine className="h-4 w-4" aria-hidden />}
              label="Total revenue"
              value={formatInrDisplay(kpis.total_revenue)}
              hint="All-time sales"
              valueClassName="text-finance-positive"
            />
            <KPICard
              icon={<Receipt className="h-4 w-4" aria-hidden />}
              label="Total expenses"
              value={formatInrDisplay(kpis.total_expenses)}
              hint="All-time spend"
              valueClassName="text-finance-negative"
            />
            <KPICard
              icon={<Warehouse className="h-4 w-4" aria-hidden />}
              label="Inventory value"
              value={formatInrDisplay(kpis.inventory_value)}
              hint="Units on hand × catalogue cost"
              iconClassName="bg-primary/10 text-primary"
            />
            <KPICard
              icon={<Wallet className="h-4 w-4" aria-hidden />}
              label="Cash in hand"
              value={formatInrDisplay(kpis.cash_in_hand)}
              hint="Revenue − expenses (simplified)"
            />
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPICard
              icon={<BarChart3 className="h-4 w-4" aria-hidden />}
              label="Gross profit"
              value={formatInrDisplay(kpis.gross_profit)}
              hint="Revenue − expenses"
              valueClassName="text-finance-positive"
            />
            <KPICard
              icon={<HandCoins className="h-4 w-4" aria-hidden />}
              label="Online received"
              value={formatInrDisplay(kpis.online_received)}
              hint="Online payment sales"
            />
            <KPICard
              icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
              label="Sales count"
              value={String(kpis.sales_count)}
              hint="Total transactions"
            />
            <KPICard
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              label="Average sale value"
              value={formatInrDisplay(kpis.average_sale_value)}
              hint="Revenue ÷ sales count"
            />
          </section>

          {topProducts ? (
            <section>
              <TopProductsTable
                topByRevenue={topProducts.top_by_revenue}
                topByMargin={topProducts.top_by_margin}
              />
            </section>
          ) : null}
        </>
      ) : (
        <p className="ui-page-description">No dashboard data yet.</p>
      )}
    </div>
  );
}
