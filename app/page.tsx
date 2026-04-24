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
  getMonthlyPerformance,
  getTopProducts,
  type DashboardDateRange,
  type DashboardKPIs,
  type DashboardTagFilter,
  type MonthlyPerformanceRow,
  type TopProductsPayload,
} from '@/lib/queries/dashboard';
import { fetchSaleTags } from '@/lib/queries/saleTags';
import type { SaleTag } from '@/lib/types/saleTag';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { TopProductsTable } from '@/components/dashboard/TopProductsTable';
import { SalesByCategoryTable } from '@/components/dashboard/SalesByCategoryTable';
import { MonthlyPerformanceChart } from '@/components/dashboard/MonthlyPerformanceChart';
import { DashboardDateRangeControl } from '@/components/dashboard/DashboardDateRangeControl';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  BarChart3,
  CircleDollarSign,
  Download,
  TrendingUp,
  Upload,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadBackupWorkbook } from '@/lib/excel/downloadBackupWorkbook';
import { parseWorkbook } from '@/lib/excel/parseWorkbook';
import { uploadWorkbook, WORKBOOK_UPLOAD_PARTIAL_APPLY_NOTE } from '@/lib/excel/uploadWorkbook';
import { devError } from '@/lib/devLog';

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
  const [monthlyPerformance, setMonthlyPerformance] = useState<MonthlyPerformanceRow[] | null>(null);
  const [dashboardSaleTagId, setDashboardSaleTagId] = useState<DashboardTagFilter>(null);
  const [dashboardTags, setDashboardTags] = useState<SaleTag[]>([]);

  const loadDashboardGenRef = useRef(0);
  const restoreUploadRef = useRef<HTMLInputElement>(null);
  const [excelBusy, setExcelBusy] = useState<'backup' | 'restore' | null>(null);

  useEffect(() => {
    if (!sessionReady) return;
    setAppliedRange(defaultDashboardYtdRange());
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data, error: tErr } = await fetchSaleTags(supabase);
      if (cancelled) return;
      if (tErr) {
        toast.error(tErr.message);
        setDashboardTags([]);
        return;
      }
      setDashboardTags(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady]);

  const loadDashboard = useCallback(async (range: DashboardDateRange, saleTagId: DashboardTagFilter) => {
    const gen = ++loadDashboardGenRef.current;
    const supabase = getSupabaseClient();
    setLoadingDashboard(true);
    setError(null);

    try {
      const [kpiRes, topRes, monthlyRes] = await withTimeout(
        Promise.all([
          getDashboardKPIs(supabase, range, saleTagId),
          getTopProducts(supabase, range, saleTagId),
          getMonthlyPerformance(supabase, range, saleTagId),
        ]),
        25_000,
        'Dashboard request timed out. Apply latest Supabase migrations (including dashboard + sale_tags), then refresh.',
      );
      if (gen !== loadDashboardGenRef.current) return;
      if (kpiRes.error) throw kpiRes.error;
      if (topRes.error) throw topRes.error;
      if (monthlyRes.error) throw monthlyRes.error;

      setKpis(kpiRes.data);
      setTopProducts(topRes.data);
      setMonthlyPerformance(monthlyRes.data ?? []);
    } catch (e: unknown) {
      if (gen !== loadDashboardGenRef.current) return;
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard';
      setError(msg);
      toast.error(msg);
      setKpis(null);
      setTopProducts(null);
      setMonthlyPerformance(null);
    } finally {
      if (gen === loadDashboardGenRef.current) {
        setLoadingDashboard(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!sessionReady || !appliedRange) return;
    void loadDashboard(appliedRange, dashboardSaleTagId);
  }, [sessionReady, appliedRange, dashboardSaleTagId, loadDashboard]);

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

  const dashboardTagScoped = dashboardSaleTagId !== null;

  async function handleDashboardBackup() {
    setExcelBusy('backup');
    try {
      await downloadBackupWorkbook(getSupabaseClient());
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed');
    } finally {
      setExcelBusy(null);
    }
  }

  async function handleRestoreWorkbook(file: File) {
    setExcelBusy('restore');
    try {
      const wb = await parseWorkbook(file);
      const summary = await uploadWorkbook(getSupabaseClient(), wb);
      let msg = `Restore: ${summary.added} added, ${summary.skipped} skipped, ${summary.errors.length} errors.`;
      if (summary.errors.length > 0) {
        msg += ` ${WORKBOOK_UPLOAD_PARTIAL_APPLY_NOTE}`;
        devError('dashboardRestoreWorkbook', summary.errors);
      }
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setExcelBusy(null);
    }
  }

  return (
    <div
      className={
        'space-y-5 md:space-y-8 max-md:[&_h1.ui-page-title]:!text-xl max-md:[&_h1.ui-page-title]:!leading-tight max-md:[&_h1.ui-page-title]:sm:!text-xl max-md:[&_p.ui-page-description]:!text-xs max-md:[&_p.ui-page-description]:!leading-snug'
      }
    >
      <PageHeader
        className="max-md:gap-2"
        title="Dashboard Overview"
        description="Operating summary for the selected period: revenue; with All tags, ledger expenses—with one tag, product cost (COGS) from sales in that tag; cash position nets sales against that counterparty by payment mode; inventory value is tenant-wide; plus product and category breakdowns."
        actions={
          <>
            <input
              ref={restoreUploadRef}
              type="file"
              className="sr-only"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-hidden
              tabIndex={-1}
              disabled={excelBusy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleRestoreWorkbook(file);
                e.currentTarget.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl border-border/80 text-sm font-semibold shadow-sm md:h-11 md:text-base"
              disabled={excelBusy !== null}
              onClick={() => void handleDashboardBackup()}
            >
              <Download className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
              {excelBusy === 'backup' ? 'Downloading…' : 'Export backup (.xlsx)'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl border-border/80 text-sm font-semibold shadow-sm md:h-11 md:text-base"
              disabled={excelBusy !== null}
              onClick={() => restoreUploadRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
              {excelBusy === 'restore' ? 'Restoring…' : 'Restore'}
            </Button>
          </>
        }
      />

      <p className="text-xs leading-relaxed text-muted-foreground">
        <Link href="/help" className="font-semibold text-primary underline-offset-4 hover:underline">
          Import order &amp; CSV help
        </Link>
        . Use a backup exported here for Restore, or fill templates from each page&apos;s ⋮ menu.
      </p>

      <DashboardDateRangeControl
        className="w-full"
        appliedRange={appliedRange}
        onApply={setAppliedRange}
        onYtd={() => setAppliedRange(defaultDashboardYtdRange())}
        disabled={loadingDashboard}
        endSlot={
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor="dashboard-sale-tag"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Scope
            </Label>
            <select
              id="dashboard-sale-tag"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-11 md:text-base"
              value={dashboardSaleTagId ?? ''}
              onChange={(e) => setDashboardSaleTagId(e.target.value === '' ? null : e.target.value)}
              disabled={loadingDashboard}
            >
              <option value="">All tags</option>
              {dashboardTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <span aria-live="polite" className="sr-only">
        {loadingDashboard && kpis ? 'Refreshing dashboard figures.' : ''}
      </span>

      {kpis ? (
        <div
          className="flex flex-col gap-5 md:gap-8"
          aria-busy={loadingDashboard}
          aria-label="Dashboard metrics"
        >
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
              label={dashboardTagScoped ? 'Product cost' : 'Total Expenses'}
              value={formatInrDisplay(kpis.total_expenses)}
              hint={
                dashboardTagScoped
                  ? 'COGS: line cost × qty for sales in this tag'
                  : 'Spend in selected period'
              }
              trendLabel={dashboardTagScoped ? 'From sales' : 'Recorded'}
              trendVariant="muted"
              valueClassName="text-finance-negative"
              iconClassName="bg-muted text-muted-foreground"
            />
            <KPICard
              icon={<TrendingUp className="h-5 w-5" aria-hidden />}
              label="Profit / Loss"
              value={formatInrDisplay(kpis.gross_profit)}
              hint={
                dashboardTagScoped
                  ? 'Revenue − product cost (period)'
                  : 'Revenue − expenses (period)'
              }
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
              hint={
                dashboardTagScoped
                  ? 'Cash + online sales in tag, each minus COGS from sales in that payment mode'
                  : 'Net cash + net online for the period'
              }
              trendLabel="Period"
              trendVariant="muted"
              iconClassName="bg-muted text-muted-foreground"
              footer={
                <div className="space-y-0.5 text-[11px] text-muted-foreground md:text-xs">
                  <p>
                    <span className="font-medium text-foreground">
                      {dashboardTagScoped ? 'Net cash (after tag COGS): ' : 'Net cash: '}
                    </span>
                    {formatInrDisplay(kpis.net_cash)}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      {dashboardTagScoped ? 'Net online (after tag COGS): ' : 'Net online: '}
                    </span>
                    {formatInrDisplay(kpis.net_online)}
                  </p>
                </div>
              }
            />
            <KPICard
              icon={<Warehouse className="h-5 w-5 shrink-0" aria-hidden />}
              label="Inventory Value"
              value={formatInrDisplay(kpis.inventory_value)}
              hint={
                dashboardSaleTagId
                  ? 'Whole business (not filtered by tag)'
                  : 'Manual lines: stock × unit cost (current)'
              }
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

          {monthlyPerformance ? (
            <MonthlyPerformanceChart
              rows={monthlyPerformance}
              counterpartyBarName={dashboardTagScoped ? 'Product cost' : 'Expenses'}
            />
          ) : null}

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
        </div>
      ) : (
        <p className="ui-page-description">No dashboard data yet.</p>
      )}
    </div>
  );
}
