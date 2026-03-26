'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { getDashboardKPIs, getTopProducts } from '@/lib/queries/dashboard';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { TopProductsTable } from '@/components/dashboard/TopProductsTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  CreditCard,
  Download,
  Filter,
  HandCoins,
  CircleDollarSign,
  Package2,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-xl rounded-md" />
        <div className="flex flex-wrap gap-2 pt-2">
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] rounded-card" />
        ))}
      </div>
    </div>
  );
}

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
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (loadingDashboard) {
    return <DashboardSkeleton />;
  }

  const profitMarginPct =
    kpis && kpis.total_revenue > 0
      ? `${((kpis.gross_profit / kpis.total_revenue) * 100).toFixed(1)}%`
      : '0.0%';

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard Overview"
        description="Operating summary: revenue, spend, stock at cost, and net cash position."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-border/80 font-semibold shadow-sm"
              onClick={() => toast.message('Backup Database — connect storage in a future release.')}
            >
              <Download className="h-4 w-4" aria-hidden />
              Backup Database
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl border-border/80 font-semibold shadow-sm"
              onClick={() => toast.message('Yearly Performance — date filters ship in V2 per PRD.')}
            >
              <Filter className="h-4 w-4" aria-hidden />
              Yearly Performance
            </Button>
          </>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {kpis ? (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KPICard
              icon={<Warehouse className="h-5 w-5" aria-hidden />}
              label="Inventory Value"
              value={formatInrDisplay(kpis.inventory_value)}
              hint="Stock at catalogue cost"
              trendLabel="Stock"
              trendVariant="neutral"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
              label="Total Revenue"
              value={formatInrDisplay(kpis.total_revenue)}
              hint="All-time sales"
              trendLabel={kpis.total_revenue > 0 ? 'Active' : '—'}
              trendVariant={kpis.total_revenue > 0 ? 'positive' : 'neutral'}
              valueClassName="text-finance-positive"
              iconClassName="bg-primary/12 text-primary"
            />
            <KPICard
              icon={<CreditCard className="h-5 w-5" aria-hidden />}
              label="Total Cash Available"
              value={formatInrDisplay(kpis.cash_in_hand)}
              hint="Net cash position"
              trendLabel="Live"
              trendVariant="neutral"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<TrendingUp className="h-5 w-5" aria-hidden />}
              label="Net Profit"
              value={formatInrDisplay(kpis.gross_profit)}
              hint="Revenue − expenses"
              trendLabel={profitMarginPct}
              trendVariant="neutral"
              valueClassName="text-finance-positive"
              iconClassName="bg-primary/12 text-primary"
            />
            <KPICard
              icon={<Package2 className="h-5 w-5" aria-hidden />}
              label="Total Sales"
              value={String(kpis.sales_count)}
              hint="Completed transactions"
              trendLabel={kpis.sales_count > 0 ? '+' + String(Math.min(kpis.sales_count, 99)) : '—'}
              trendVariant={kpis.sales_count > 0 ? 'positive' : 'neutral'}
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<BarChart3 className="h-5 w-5" aria-hidden />}
              label="Avg Sale Value"
              value={formatInrDisplay(kpis.average_sale_value)}
              hint="Revenue ÷ sales count"
              trendLabel="All-time"
              trendVariant="muted"
              iconClassName="bg-muted text-muted-foreground"
            />
          </section>

          <section className="grid grid-cols-2 gap-4 md:grid-cols-2">
            <KPICard
              icon={<HandCoins className="h-5 w-5" aria-hidden />}
              label="Total Expenses"
              value={formatInrDisplay(kpis.total_expenses)}
              hint="All-time spend"
              trendLabel="Recorded"
              trendVariant="muted"
              valueClassName="text-finance-negative"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
              label="Online Received"
              value={formatInrDisplay(kpis.online_received)}
              hint="Online payment sales"
              trendLabel="UPI / Card"
              trendVariant="neutral"
              iconClassName="bg-primary/12 text-primary"
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
