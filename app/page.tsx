'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';
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
import { PaymentCollectionsCard } from '@/components/dashboard/PaymentCollectionsCard';
import { SalesByCategoryTable } from '@/components/dashboard/SalesByCategoryTable';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  Package2,
  TrendingUp,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';

function DashboardSkeleton({ phase }: { phase: 'session' | 'data' }) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {phase === 'session' ? 'Checking your session…' : 'Loading dashboard…'}
      </p>
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

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function compareYmd(a: string, b: string): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  if (!pa || !pb) return 0;
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.m !== pb.m) return pa.m - pb.m;
  return pa.d - pb.d;
}

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedRange, setAppliedRange] = useState<DashboardDateRange | null>(null);

  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductsPayload | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const supabase = getSupabaseClient();
        const { data, error: authErr } = await withTimeout(
          supabase.auth.getUser(),
          25_000,
          'Sign-in check timed out. Check your network, then refresh.',
        );
        if (cancelled) return;
        if (authErr) {
          setSessionError(authErr.message);
          setCheckingSession(false);
          setIsAuthenticated(false);
          return;
        }
        const hasSession = Boolean(data.user);
        setIsAuthenticated(hasSession);
        setCheckingSession(false);

        if (!hasSession) {
          router.replace('/login');
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Could not initialize app';
        setSessionError(msg);
        setCheckingSession(false);
        setIsAuthenticated(false);
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const ytd = defaultDashboardYtdRange();
    setDateFrom(ytd.from);
    setDateTo(ytd.to);
    setAppliedRange(ytd);
  }, [isAuthenticated]);

  const loadDashboard = useCallback(
    async (range: DashboardDateRange) => {
      const supabase = getSupabaseClient();
      setLoadingDashboard(true);
      setError(null);

      try {
        const [kpiRes, topRes] = await withTimeout(
          Promise.all([getDashboardKPIs(supabase, range), getTopProducts(supabase, range)]),
          25_000,
          'Dashboard request timed out. If you just updated SQL, apply migration 20260330140000_dashboard_v2_date_range.sql on Supabase, then refresh.',
        );
        if (kpiRes.error) throw kpiRes.error;
        if (topRes.error) throw topRes.error;

        setKpis(kpiRes.data);
        setTopProducts(topRes.data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load dashboard';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoadingDashboard(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isAuthenticated || !appliedRange) return;
    void loadDashboard(appliedRange);
  }, [isAuthenticated, appliedRange, loadDashboard]);

  const applyDateRange = useCallback(() => {
    if (!parseYmd(dateFrom) || !parseYmd(dateTo)) {
      toast.error('Use a valid from / to date (YYYY-MM-DD).');
      return;
    }
    if (compareYmd(dateFrom, dateTo) > 0) {
      toast.error('From date must be on or before To date.');
      return;
    }
    setAppliedRange({ from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo]);

  const resetYtd = useCallback(() => {
    const ytd = defaultDashboardYtdRange();
    setDateFrom(ytd.from);
    setDateTo(ytd.to);
    setAppliedRange(ytd);
  }, []);

  if (checkingSession) {
    return <DashboardSkeleton phase="session" />;
  }

  if (sessionError) {
    return (
      <div className="space-y-4 rounded-card border border-destructive/40 bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-destructive">Something went wrong</p>
        <p className="text-sm text-muted-foreground">{sessionError}</p>
        <Button type="button" variant="outline" className="rounded-xl" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
        <Button type="button" variant="link" className="text-primary" asChild>
          <Link href="/login">Open login</Link>
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

  const rangeLabel =
    appliedRange && parseYmd(appliedRange.from) && parseYmd(appliedRange.to)
      ? `${appliedRange.from} → ${appliedRange.to}`
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard Overview"
        description="Operating summary for the selected period: revenue, spend, stock at cost, collections split, and product/category breakdowns."
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
          </>
        }
      />

      <div className="flex flex-col gap-4 rounded-card border border-border/70 bg-card/40 p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-2 sm:min-w-[160px]">
          <Label htmlFor="dash-from" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            From
          </Label>
          <Input
            id="dash-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-11 rounded-xl font-medium"
          />
        </div>
        <div className="grid gap-2 sm:min-w-[160px]">
          <Label htmlFor="dash-to" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            To
          </Label>
          <Input
            id="dash-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-11 rounded-xl font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 rounded-xl font-semibold"
            onClick={() => applyDateRange()}
            disabled={loadingDashboard}
          >
            Apply range
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-xl font-semibold"
            onClick={() => resetYtd()}
            disabled={loadingDashboard}
          >
            Reset to YTD
          </Button>
        </div>
        {rangeLabel ? (
          <p className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto sm:text-right">
            Showing: <span className="font-medium text-foreground">{rangeLabel}</span>
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loadingDashboard && kpis ? (
        <p className="text-sm text-muted-foreground">Refreshing figures…</p>
      ) : null}

      {kpis ? (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <KPICard
              icon={<Warehouse className="h-5 w-5" aria-hidden />}
              label="Inventory Value"
              value={formatInrDisplay(kpis.inventory_value)}
              hint="Stock at catalogue cost (current)"
              trendLabel="Stock"
              trendVariant="neutral"
              iconClassName="bg-muted text-muted-foreground"
            />
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
              icon={<TrendingUp className="h-5 w-5" aria-hidden />}
              label="Net Profit"
              value={formatInrDisplay(kpis.gross_profit)}
              hint="Revenue − expenses (period)"
              trendLabel={profitMarginPct}
              trendVariant="neutral"
              valueClassName="text-finance-positive"
              iconClassName="bg-primary/12 text-primary"
            />
            <KPICard
              icon={<Package2 className="h-5 w-5" aria-hidden />}
              label="Total Sales"
              value={String(kpis.sales_count)}
              hint="Transactions in period"
              trendLabel={kpis.sales_count > 0 ? '+' + String(Math.min(kpis.sales_count, 99)) : '—'}
              trendVariant={kpis.sales_count > 0 ? 'positive' : 'neutral'}
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<BarChart3 className="h-5 w-5" aria-hidden />}
              label="Avg Sale Value"
              value={formatInrDisplay(kpis.average_sale_value)}
              hint="Revenue ÷ sales count"
              trendLabel="Period"
              trendVariant="muted"
              iconClassName="bg-muted text-muted-foreground"
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
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <PaymentCollectionsCard
              cashCollected={kpis.cash_collected}
              onlineCollected={kpis.online_collected}
            />
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
