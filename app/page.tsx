'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import {
  defaultDashboardYtdRange,
  getDashboardKPIs,
  getTopProducts,
  type DashboardDateRange,
  type DashboardKPIs,
  type TopProductsPayload,
} from '@/lib/queries/dashboard';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { TopProductsTable } from '@/components/dashboard/TopProductsTable';
import { SalesByCategoryTable } from '@/components/dashboard/SalesByCategoryTable';
import { DashboardDateRangeControl } from '@/components/dashboard/DashboardDateRangeControl';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  TrendingUp,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';

function DashboardSkeleton({ phase }: { phase: 'session' | 'data' }) {
  return (
    <div className="space-y-5 md:space-y-8">
      <p className="text-xs text-muted-foreground md:text-sm">
        {phase === 'session' ? 'Checking your session…' : 'Loading dashboard…'}
      </p>
      <div className="space-y-2 md:space-y-3">
        <Skeleton className="h-8 w-56 rounded-lg md:h-9 md:w-64" />
        <Skeleton className="h-3.5 w-full max-w-xl rounded-md md:h-4" />
        <div className="flex flex-wrap gap-2 pt-1 md:pt-2">
          <Skeleton className="h-9 w-36 rounded-xl md:h-10 md:w-40" />
          <Skeleton className="h-9 w-40 rounded-xl md:h-10 md:w-44" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-card md:h-[140px]" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const session = useBusinessSession({ onMissingBusiness: 'error' });
  const sessionReady = session.kind === 'ready';

  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appliedRange, setAppliedRange] = useState<DashboardDateRange | null>(null);

  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductsPayload | null>(null);

  const loadDashboardGenRef = useRef(0);

  useEffect(() => {
    if (!sessionReady) return;
    setAppliedRange(defaultDashboardYtdRange());
  }, [sessionReady]);

  const loadDashboard = useCallback(async (range: DashboardDateRange) => {
    const gen = ++loadDashboardGenRef.current;
    const supabase = getSupabaseClient();
    setLoadingDashboard(true);
    setError(null);

    try {
      const [kpiRes, topRes] = await withTimeout(
        Promise.all([getDashboardKPIs(supabase, range), getTopProducts(supabase, range)]),
        25_000,
        'Dashboard request timed out. Apply migrations 20260331130000_expenses_update_inventory_flag.sql and 20260331140000_dashboard_kpis_net_cash_inventory_items.sql on Supabase, then refresh.',
      );
      if (gen !== loadDashboardGenRef.current) return;
      if (kpiRes.error) throw kpiRes.error;
      if (topRes.error) throw topRes.error;

      setKpis(kpiRes.data);
      setTopProducts(topRes.data);
    } catch (e: unknown) {
      if (gen !== loadDashboardGenRef.current) return;
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard';
      setError(msg);
      toast.error(msg);
    } finally {
      if (gen === loadDashboardGenRef.current) {
        setLoadingDashboard(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionReady || !appliedRange) return;
    void loadDashboard(appliedRange);
  }, [sessionReady, appliedRange, loadDashboard]);

  if (session.kind === 'loading') {
    return <DashboardSkeleton phase="session" />;
  }

  if (session.kind === 'redirect_login') {
    return <SessionRedirectNotice to="login" />;
  }

  if (session.kind === 'redirect_home') {
    return <SessionRedirectNotice to="home" />;
  }

  if (session.kind === 'error') {
    return (
      <div className="space-y-4 rounded-card border border-destructive/40 bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-destructive">Something went wrong</p>
        <p className="text-sm text-muted-foreground">{session.message}</p>
        <Button type="button" variant="outline" className="rounded-xl" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  if (loadingDashboard && !kpis) {
    return <DashboardSkeleton phase="data" />;
  }

  const profitMarginPct =
    kpis && kpis.total_revenue > 0
      ? `${((kpis.gross_profit / kpis.total_revenue) * 100).toFixed(1)}%`
      : '0.0%';

  return (
    <div
      className={
        'space-y-5 md:space-y-8 max-md:[&_h1.ui-page-title]:!text-xl max-md:[&_h1.ui-page-title]:!leading-tight max-md:[&_h1.ui-page-title]:sm:!text-xl max-md:[&_p.ui-page-description]:!text-xs max-md:[&_p.ui-page-description]:!leading-snug'
      }
    >
      <PageHeader
        className="max-md:gap-2"
        title="Dashboard Overview"
        description="Operating summary for the selected period: revenue, spend, cash position (sales minus expenses by payment mode), stock on hand at cost, and product/category breakdowns."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl border-border/80 text-sm font-semibold shadow-sm md:h-11 md:text-base"
              onClick={() => toast.message('Backup Database — connect storage in a future release.')}
            >
              <Download className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
              Backup Database
            </Button>
          </>
        }
      />

      <DashboardDateRangeControl
        appliedRange={appliedRange}
        onApply={setAppliedRange}
        onYtd={() => setAppliedRange(defaultDashboardYtdRange())}
        disabled={loadingDashboard}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loadingDashboard && kpis ? (
        <p className="text-xs text-muted-foreground md:text-sm">Refreshing figures…</p>
      ) : null}

      {kpis ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3">
            <KPICard
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
              label="Total Revenue"
              value={formatInrDisplay(kpis.total_revenue)}
              hint="Sales in selected period"
              trendLabel={kpis.total_revenue > 0 ? 'Active' : '—'}
              trendVariant={kpis.total_revenue > 0 ? 'positive' : 'neutral'}
              valueClassName="text-finance-positive"
              iconClassName="bg-primary/12 text-primary"
            />
            <KPICard
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden />}
              label="Total Expenses"
              value={formatInrDisplay(kpis.total_expenses)}
              hint="Spend in selected period"
              trendLabel="Recorded"
              trendVariant="muted"
              valueClassName="text-finance-negative"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<TrendingUp className="h-5 w-5" aria-hidden />}
              label="Profit / Loss"
              value={formatInrDisplay(kpis.gross_profit)}
              hint="Revenue − expenses (period)"
              trendLabel={profitMarginPct}
              trendVariant="neutral"
              valueClassName={
                kpis.gross_profit >= 0 ? 'text-finance-positive' : 'text-finance-negative'
              }
              iconClassName="bg-primary/12 text-primary"
            />
            <KPICard
              icon={<Wallet className="h-5 w-5 shrink-0" aria-hidden />}
              label="Cash in Hand"
              value={formatInrDisplay(kpis.cash_in_hand_total)}
              hint="Net cash + net online for the period"
              trendLabel="Period"
              trendVariant="muted"
              iconClassName="bg-muted text-muted-foreground"
              footer={
                <div className="space-y-0.5 text-[11px] text-muted-foreground md:text-xs">
                  <p>
                    <span className="font-medium text-foreground">Net cash: </span>
                    {formatInrDisplay(kpis.net_cash)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Net online: </span>
                    {formatInrDisplay(kpis.net_online)}
                  </p>
                </div>
              }
            />
            <KPICard
              icon={<Warehouse className="h-5 w-5 shrink-0" aria-hidden />}
              label="Inventory Value"
              value={formatInrDisplay(kpis.inventory_value)}
              hint="Manual lines: stock × unit cost (current)"
              trendLabel="Stock"
              trendVariant="neutral"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<BarChart3 className="h-5 w-5" aria-hidden />}
              label="Avg Order Value"
              value={formatInrDisplay(kpis.average_sale_value)}
              hint={`Revenue ÷ ${kpis.sales_count} sale(s)`}
              trendLabel="Period"
              trendVariant="muted"
              iconClassName="bg-muted text-muted-foreground"
            />
          </section>

          <section className="grid gap-3 md:gap-4">
            {topProducts ? <SalesByCategoryTable rows={topProducts.sales_by_category} /> : null}
          </section>

          {topProducts ? (
            <section>
              <TopProductsTable
                topByRevenue={topProducts.top_by_revenue}
                topByMargin={topProducts.top_by_margin}
                topByVolume={topProducts.top_by_volume}
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
