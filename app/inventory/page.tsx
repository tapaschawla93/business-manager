'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, RefreshCw, Search, Trash2, Warehouse } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { parseCsv } from '@/lib/importCsv';
import { importInventoryCsvRows, inventoryImportIssuesCsv } from '@/lib/inventory/importInventoryCsv';
import { devError } from '@/lib/devLog';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchInventoryItems } from '@/lib/queries/inventoryItems';
import type { InventoryItem } from '@/lib/types/inventoryItem';
import type { Product } from '@/lib/types/product';
import { formatInrDisplay } from '@/lib/formatInr';
import { PageHeader } from '@/components/PageHeader';
import { ProductPicker } from '@/app/sales/components/ProductPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { InventoryMobileList } from '@/app/inventory/components/InventoryMobileList';
import { ModuleCsvMenu } from '@/components/ModuleCsvMenu';

/** Optional reorder hint: highlight when at or on threshold (inclusive). */
function isLowStock(row: InventoryItem): boolean {
  if (row.reorder_level == null) return false;
  return Number(row.current_stock) <= Number(row.reorder_level);
}

function productLineName(p: Product): string {
  return `${p.name}${p.variant ? ` · ${p.variant}` : ''}`;
}

export default function InventoryPage() {
  const session = useBusinessSession({ onMissingBusiness: 'error' });
  const businessId = session.kind === 'ready' ? session.businessId : null;
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showZeroStock, setShowZeroStock] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formStock, setFormStock] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formReorder, setFormReorder] = useState('');
  const [formProductId, setFormProductId] = useState<string | null>(null);
  const [pickerLabel, setPickerLabel] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  /** For edit: prior unit cost — RPC sync only when cost changes (add always syncs when linked). */
  const [baselineUnitCost, setBaselineUnitCost] = useState<number | null>(null);
  const [deleteLineTargetId, setDeleteLineTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    const supabase = getSupabaseClient();
    setLoading(true);
    setError(null);
    const [invRes, prodRes] = await Promise.all([
      fetchInventoryItems(supabase, { businessId }),
      supabase.from('products').select('*').is('deleted_at', null).order('name', { ascending: true }),
    ]);
    setLoading(false);
    if (invRes.error) {
      setError(invRes.error.message);
      return;
    }
    setRows(invRes.data ?? []);
    if (prodRes.error) {
      setError(prodRes.error.message);
      return;
    }
    setProducts((prodRes.data as Product[]) ?? []);
    setError(null);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    void load();
  }, [businessId, load]);

  /** Refetch when returning from another tab (e.g. after recording a sale). */
  useEffect(() => {
    if (!businessId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [businessId, load]);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hit = (s: string) => s.toLowerCase().includes(q);
      return hit(r.name) || hit(r.unit);
    });
  }, [rows, searchQuery]);

  const visibleRows = useMemo(() => {
    if (showZeroStock) return searchFiltered;
    return searchFiltered.filter((r) => Number(r.current_stock) > 0);
  }, [searchFiltered, showZeroStock]);

  const duplicateProductForAdd = useMemo(() => {
    if (editingId || !formProductId) return false;
    return rows.some((r) => r.product_id === formProductId);
  }, [editingId, formProductId, rows]);

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + Number(r.current_stock) * Number(r.unit_cost), 0),
    [rows],
  );
  const totalUnits = useMemo(() => rows.reduce((s, r) => s + Number(r.current_stock), 0), [rows]);

  function resetForm() {
    setEditingId(null);
    setFormStock('');
    setFormCost('');
    setFormReorder('');
    setFormProductId(null);
    setPickerLabel(undefined);
    setBaselineUnitCost(null);
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function startEdit(row: InventoryItem) {
    setEditingId(row.id);
    setFormStock(String(row.current_stock));
    setFormCost(String(row.unit_cost));
    setFormReorder(row.reorder_level != null ? String(row.reorder_level) : '');
    setFormProductId(row.product_id);
    setBaselineUnitCost(Number(row.unit_cost));
    if (row.product_id) {
      const p = products.find((x) => x.id === row.product_id);
      setPickerLabel(p ? productLineName(p) : undefined);
    } else {
      setPickerLabel(undefined);
    }
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) resetForm();
  }

  function downloadInventoryTemplate() {
    const headers = ['product_name', 'variant', 'unit', 'current_stock', 'unit_cost', 'reorder_level'];
    const sample = [
      {
        product_name: 'Grow bags',
        variant: '5kg',
        unit: 'pcs',
        current_stock: '100',
        unit_cost: '12',
        reorder_level: '20',
      },
    ];
    downloadCsv('template_inventory.csv', rowsToCsv(headers, sample));
  }

  async function importInventoryFile(file: File) {
    if (!businessId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const { rows: csvRows } = parseCsv(text);
      const supabase = getSupabaseClient();
      const { data: productRows, error: pErr } = await supabase
        .from('products')
        .select('id, name, variant')
        .is('deleted_at', null);
      if (pErr) {
        toast.error(pErr.message);
        return;
      }
      const result = await importInventoryCsvRows(
        supabase,
        businessId,
        csvRows,
        (productRows ?? []) as Pick<Product, 'id' | 'name' | 'variant'>[],
      );
      if (result.issues.length > 0) {
        downloadCsv('inventory_import_errors.csv', inventoryImportIssuesCsv(result.issues));
      }
      toast.success(`Inventory import: ${result.inserted} inserted, ${result.issues.length} issues.`);
      await load();
    } catch (e) {
      devError('inventory import', e);
      toast.error(e instanceof Error ? e.message : 'Inventory import failed');
    } finally {
      setImporting(false);
    }
  }

  async function maybeSyncCostFromInventorySave(productId: string, unitCost: number) {
    const shouldSync =
      baselineUnitCost === null || Math.round(unitCost * 100) !== Math.round(baselineUnitCost * 100);
    if (!shouldSync) return;
    const supabase = getSupabaseClient();
    const { error: rpcErr } = await supabase.rpc('sync_product_cost_from_expense', {
      p_business_id: businessId,
      p_product_id: productId,
      p_unit_cost: unitCost,
    });
    if (rpcErr) {
      toast.error(rpcErr.message || 'Could not sync catalog unit cost');
    }
  }

  async function submitInventoryForm(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;

    const cost = Number(formCost);
    const reorderRaw = formReorder.trim();
    const reorder = reorderRaw === '' ? null : Number(reorderRaw);

    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Unit cost must be a number ≥ 0');
      return;
    }
    if (reorder !== null && (!Number.isFinite(reorder) || reorder < 0)) {
      toast.error('Reorder level must be ≥ 0 when set');
      return;
    }

    const supabase = getSupabaseClient();
    setSaving(true);

    if (!editingId) {
      if (!formProductId) {
        setSaving(false);
        toast.error('Select a catalog product');
        return;
      }
      if (rows.some((r) => r.product_id === formProductId)) {
        setSaving(false);
        toast.error('This product already has an inventory row');
        return;
      }
      const delta = Number(formStock);
      if (!Number.isFinite(delta) || delta <= 0) {
        setSaving(false);
        toast.error('Units to Add must be a number > 0');
        return;
      }
      const product = products.find((p) => p.id === formProductId);
      if (!product) {
        setSaving(false);
        toast.error('Product not found');
        return;
      }
      const payload = {
        name: productLineName(product),
        unit: 'pcs',
        current_stock: delta,
        unit_cost: cost,
        reorder_level: reorder,
        product_id: formProductId,
      };
      const { error: insErr } = await supabase.from('inventory_items').insert({
        business_id: businessId,
        ...payload,
      });
      setSaving(false);
      if (insErr) {
        toast.error(insErr.message);
        return;
      }
      toast.success('Inventory line added');
      await maybeSyncCostFromInventorySave(formProductId, cost);
    } else {
      const row = rows.find((r) => r.id === editingId);
      if (!row) {
        setSaving(false);
        toast.error('Row not found');
        return;
      }
      const stock = Number(formStock);
      if (!Number.isFinite(stock) || stock < 0) {
        setSaving(false);
        toast.error('Current stock must be a number ≥ 0');
        return;
      }

      let name = row.name;
      let productId = row.product_id;
      if (productId) {
        const p = products.find((x) => x.id === productId);
        if (p) name = productLineName(p);
      }

      const payload = {
        name,
        unit: row.unit || 'pcs',
        current_stock: stock,
        unit_cost: cost,
        reorder_level: reorder,
        product_id: productId,
      };

      const { error: upErr } = await supabase
        .from('inventory_items')
        .update(payload)
        .eq('id', editingId)
        .eq('business_id', businessId);
      setSaving(false);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      toast.success('Inventory line updated');
      if (productId) {
        await maybeSyncCostFromInventorySave(productId, cost);
      }
    }

    resetForm();
    setDialogOpen(false);
    await load();
  }

  /**
   * Deletes a manual inventory row without relying on `delete_inventory_item` RPC (works even if that
   * migration was not applied). Pulls linked on-hand qty off the ledger first, then removes the row.
   */
  async function confirmDeleteInventoryLine() {
    const id = deleteLineTargetId;
    if (!businessId || !id) return;
    const target = rows.find((r) => r.id === id);
    setDeleteLineTargetId(null);
    if (!target) {
      toast.error('That line is no longer in the list.');
      return;
    }

    const supabase = getSupabaseClient();
    const pid = target.product_id;
    const stock = Number(target.current_stock);
    if (pid && Number.isFinite(stock) && stock > 0) {
      const { error: dErr } = await supabase.rpc('inventory_apply_delta_for_tenant', {
        p_business_id: businessId,
        p_product_id: pid,
        p_delta: -stock,
      });
      if (dErr) {
        toast.error(dErr.message);
        return;
      }
    }

    const { error: delErr } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }

    toast.success('Inventory line removed');
    if (editingId === id) {
      resetForm();
      setDialogOpen(false);
    }
    await load();
  }

  if (session.kind === 'loading') {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-12 w-full max-w-md rounded-xl" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (session.kind === 'redirect_login') {
    return <SessionRedirectNotice to="login" />;
  }

  if (session.kind === 'error') {
    return <p className="text-sm text-destructive">{session.message}</p>;
  }

  if (session.kind === 'redirect_home') {
    return <SessionRedirectNotice to="home" />;
  }

  if (!businessId) {
    return null;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        description="Each line is tied to a catalog product. On-hand quantity stays in sync with sales and stock-purchase expenses. When adding a line, Units to Add increases stock for that product."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl text-sm md:h-11 md:text-base"
              onClick={() => void load()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl text-sm font-semibold shadow-sm md:h-11 md:text-base"
              onClick={openAdd}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add line
            </Button>
            <ModuleCsvMenu
              menuAriaLabel="Inventory CSV import"
              busy={importing}
              disabled={!businessId}
              onDownloadTemplate={downloadInventoryTemplate}
              onFileSelected={(f) => void importInventoryFile(f)}
            />
          </>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-primary/15 bg-gradient-to-br from-card to-accent/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Inventory value (qty × unit cost)</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-foreground md:text-2xl">
              {formatInrDisplay(totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total units (all lines)</p>
            <p className="mt-1 text-lg font-bold tracking-tight tabular-nums md:text-2xl">
              {totalUnits.toLocaleString('en-IN')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or unit…"
            className="rounded-xl pl-10"
          />
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Switch
            id="inv-show-zero"
            checked={showZeroStock}
            onCheckedChange={setShowZeroStock}
            aria-label="Show zero-stock lines"
          />
          <Label htmlFor="inv-show-zero" className="cursor-pointer text-sm font-medium text-foreground">
            Show zero stock
          </Label>
        </div>
      </div>

      <Card className="overflow-hidden border-border/80 shadow-md">
        <CardHeader className="pb-2">
          <h2 className="ui-section-title">Lines</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Warehouse className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No inventory lines yet.</p>
              <Button type="button" onClick={openAdd} className="h-10 gap-2 text-sm md:h-11 md:text-base">
                <Plus className="h-4 w-4" />
                Add your first line
              </Button>
            </div>
          ) : searchFiltered.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No matching lines</p>
              <p className="text-xs text-muted-foreground">Try a different search term.</p>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No lines with stock on hand</p>
              <p className="text-xs text-muted-foreground">
                Turn on <span className="font-medium text-foreground">Show zero stock</span> to include zero-quantity rows.
              </p>
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <InventoryMobileList
                  rows={visibleRows}
                  products={products}
                  onEdit={startEdit}
                  onDeleteLine={(row) => setDeleteLineTargetId(row.id)}
                  dimZeroStock={showZeroStock}
                />
              </div>
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                        <TableHead className="ui-table-head">Name</TableHead>
                        <TableHead className="ui-table-head">Unit</TableHead>
                        <TableHead className="ui-table-head text-right">On hand</TableHead>
                        <TableHead className="ui-table-head text-right">Unit cost</TableHead>
                        <TableHead className="ui-table-head text-right">Value</TableHead>
                        <TableHead className="ui-table-head">Reorder</TableHead>
                        <TableHead className="ui-table-head">Product</TableHead>
                        <TableHead className="ui-table-head text-right w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((r) => {
                        const low = isLowStock(r);
                        const val = Number(r.current_stock) * Number(r.unit_cost);
                        const linked = r.product_id ? products.find((p) => p.id === r.product_id) : null;
                        const zeroShown = showZeroStock && Number(r.current_stock) <= 0;
                        return (
                          <TableRow
                            key={r.id}
                            className={
                              zeroShown
                                ? 'border-destructive/20 bg-destructive/5 text-muted-foreground hover:bg-destructive/10 dark:bg-destructive/10'
                                : low
                                  ? 'bg-amber-50/80 hover:bg-amber-50 dark:bg-amber-950/25 dark:hover:bg-amber-950/35'
                                  : 'hover:bg-muted/40'
                            }
                          >
                            <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.current_stock}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatInrDisplay(Number(r.unit_cost))}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{formatInrDisplay(val)}</TableCell>
                            <TableCell className="tabular-nums text-sm">{r.reorder_level ?? '—'}</TableCell>
                            <TableCell className="text-sm">
                              {linked ? (
                                <Badge variant="secondary" className="max-w-[180px] truncate">
                                  {linked.name}
                                  {linked.variant ? ` · ${linked.variant}` : ''}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9"
                                  aria-label="Edit"
                                  onClick={() => startEdit(r)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                  aria-label="Delete line"
                                  onClick={() => setDeleteLineTargetId(r.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteLineTargetId !== null} onOpenChange={(o) => !o && setDeleteLineTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete inventory line?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes this row and returns its on-hand quantity to the stock ledger for linked products. This cannot be
              undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteInventoryLine()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit inventory line' : 'Add inventory line'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update on-hand quantity and costs. The catalog product cannot be changed — add a new line if you need a different product.'
                : 'Choose a product from your catalog. Units to Add increases on-hand stock for that product (new lines start from zero on this row).'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitInventoryForm(e)} className="space-y-4">
            {editingId && rows.find((r) => r.id === editingId)?.product_id ? (
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Product</Label>
                <p className="text-sm font-semibold text-foreground">{pickerLabel ?? '—'}</p>
                <p className="text-[11px] text-muted-foreground">Product link is fixed for this row.</p>
              </div>
            ) : null}
            {editingId && !rows.find((r) => r.id === editingId)?.product_id ? (
              <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/90 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="font-medium text-foreground">Legacy line (not linked)</p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{rows.find((r) => r.id === editingId)?.name ?? '—'}</span>{' '}
                  — imported or created before catalog-only lines. You can adjust stock and cost; link by creating a new
                  line from Products if needed.
                </p>
              </div>
            ) : null}
            {!editingId ? (
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Product *</Label>
                <ProductPicker
                  products={products}
                  triggerLabel={pickerLabel}
                  onPick={(p) => {
                    setFormProductId(p.id);
                    setPickerLabel(productLineName(p));
                    setFormCost(String(p.cost_price ?? ''));
                  }}
                />
                {formProductId ? (
                  <p className="text-sm font-medium text-foreground">
                    {(() => {
                      const sel = products.find((x) => x.id === formProductId);
                      return sel ? productLineName(sel) : '—';
                    })()}
                  </p>
                ) : null}
                {duplicateProductForAdd ? (
                  <p className="text-sm text-destructive">
                    This product already has an inventory row — use Edit on that row instead.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-1">
              <Label>{editingId ? 'Current stock *' : 'Units to Add *'}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={editingId ? 0 : undefined}
                step="0.001"
                value={formStock}
                onChange={(e) => setFormStock(e.target.value)}
                required
              />
              {!editingId ? (
                <p className="text-[11px] text-muted-foreground">
                  Adds to existing stock. Current:{' '}
                  {formProductId && !duplicateProductForAdd ? 0 : formProductId ? '—' : 0} units
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Unit cost (₹) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Reorder level (optional)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={formReorder}
                onChange={(e) => setFormReorder(e.target.value)}
                placeholder="Highlight row when stock ≤ this"
              />
            </div>
            <Button
              type="submit"
              size="full"
              disabled={saving || (!editingId && (!formProductId || duplicateProductForAdd))}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
