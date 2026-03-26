'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, RefreshCw, Search } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchInventoryOverview, type InventoryProductRow } from '@/lib/queries/inventory';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function InventoryPage() {
  const router = useRouter();
  const [sessionOk, setSessionOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    if (!businessId) return;
    const supabase = getSupabaseClient();
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchInventoryOverview(supabase, { businessId });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRows(data ?? []);
  }, [businessId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      setSessionOk(true);
      const { data: profile, error: pe } = await supabase.from('profiles').select('business_id').single();
      if (pe || !profile?.business_id) {
        setError(pe?.message ?? 'No business profile');
        setChecking(false);
        return;
      }
      setBusinessId(profile.business_id);
      setChecking(false);
    })();
  }, [router]);

  useEffect(() => {
    if (!businessId) return;
    void load();
  }, [businessId, load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const v = (s: string) => s.toLowerCase().includes(q);
      return v(r.name) || v(r.category) || v(r.variant ?? '');
    });
  }, [rows, searchQuery]);

  const totalValue = useMemo(() => rows.reduce((s, r) => s + r.inventory_value, 0), [rows]);
  const totalUnits = useMemo(() => rows.reduce((s, r) => s + r.quantity_on_hand, 0), [rows]);

  if (checking || !sessionOk) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!businessId) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="On-hand units from purchases and sales. Value uses each product’s catalogue cost."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-primary/15 bg-gradient-to-br from-card to-accent/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Inventory value (at cost)</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{formatInrDisplay(totalValue)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Units on hand (all SKUs)</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{totalUnits.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by product or category…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="ui-section-title">By product</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading inventory…</p>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Package className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No matching products or no stock recorded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium text-foreground">
                      {r.name}
                      {r.variant ? <span className="text-muted-foreground"> · {r.variant}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity_on_hand}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(Number(r.cost_price))}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatInrDisplay(r.inventory_value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
