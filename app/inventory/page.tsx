'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Pencil, Plus, RefreshCw, Search, Upload, Warehouse } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { parseCsv } from '@/lib/importCsv';
import { importInventoryCsvRows, inventoryImportIssuesCsv } from '@/lib/inventory/importInventoryCsv';
import { insertStubProductForInventory } from '@/lib/inventory/stubProduct';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

/** Optional reorder hint: highlight when at or on threshold (inclusive). */
function isLowStock(row: InventoryItem): boolean {
  if (row.reorder_level == null) return false;
  return Number(row.current_stock) <= Number(row.reorder_level);
}

export default function InventoryPage() {
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [sessionOk, setSessionOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formStock, setFormStock] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formReorder, setFormReorder] = useState('');
  const [formProductId, setFormProductId] = useState<string | null>(null);
  const [pickerLabel, setPickerLabel] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  /** Deferred save when user must choose stub vs unlinked. */
  const [linkChoiceOpen, setLinkChoiceOpen] = useState(false);

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
    let mounted = true;
    const supabase = getSupabaseClient();
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      setSessionOk(true);
      const { data: profile, error: pe } = await supabase.from('profiles').select('business_id').single();
      if (!mounted) return;
      if (pe || !profile?.business_id) {
        setError(pe?.message ?? 'No business profile');
        setChecking(false);
        return;
      }
      setBusinessId(profile.business_id);
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hit = (s: string) => s.toLowerCase().includes(q);
      return hit(r.name) || hit(r.unit);
    });
  }, [rows, searchQuery]);

  const totalValue = useMemo(
    () => rows.reduce((s, r) => s + Number(r.current_stock) * Number(r.unit_cost), 0),
    [rows],
  );
  const totalUnits = useMemo(() => rows.reduce((s, r) => s + Number(r.current_stock), 0), [rows]);

  function resetForm() {
    setEditingId(null);
    setFormName('');
    setFormUnit('pcs');
    setFormStock('');
    setFormCost('');
    setFormReorder('');
    setFormProductId(null);
    setPickerLabel(undefined);
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function startEdit(row: InventoryItem) {
    setEditingId(row.id);
    setFormName(row.name);
    setFormUnit(row.unit || 'pcs');
    setFormStock(String(row.current_stock));
    setFormCost(String(row.unit_cost));
    setFormReorder(row.reorder_level != null ? String(row.reorder_level) : '');
    setFormProductId(row.product_id);
    if (row.product_id) {
      const p = products.find((x) => x.id === row.product_id);
      setPickerLabel(p ? `${p.name}${p.variant ? ` · ${p.variant}` : ''}` : undefined);
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
    const headers = ['name', 'unit', 'current_stock', 'unit_cost', 'reorder_level', 'product_lookup', 'add_to_products'];
    const sample = [
      {
        name: 'Grow bags 5kg',
        unit: 'pcs',
        current_stock: '100',
        unit_cost: '12',
        reorder_level: '20',
        product_lookup: '',
        add_to_products: 'false',
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

  async function persistItem(productId: string | null) {
    if (!businessId) return;
    const stock = Number(formStock);
    const cost = Number(formCost);
    const reorderRaw = formReorder.trim();
    const reorder = reorderRaw === '' ? null : Number(reorderRaw);

    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error('Current stock must be a number ≥ 0');
      return;
    }
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
    const payload = {
      name: formName.trim(),
      unit: formUnit.trim() || 'pcs',
      current_stock: stock,
      unit_cost: cost,
      reorder_level: reorder,
      product_id: productId,
    };

    if (editingId) {
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
    } else {
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
    }

    setLinkChoiceOpen(false);
    resetForm();
    setDialogOpen(false);
    await load();
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;

    if (formProductId) {
      await persistItem(formProductId);
      return;
    }

    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }

    setLinkChoiceOpen(true);
  }

  async function handleSaveUnlinked() {
    await persistItem(null);
  }

  async function handleSaveWithStub() {
    if (!businessId) return;
    const cost = Number(formCost);
    const supabase = getSupabaseClient();
    setSaving(true);
    const stub = await insertStubProductForInventory(supabase, businessId, formName.trim(), cost);
    if (stub.error || !stub.id) {
      setSaving(false);
      toast.error(stub.error ?? 'Could not create product');
      return;
    }
    setSaving(false);
    await persistItem(stub.id);
  }

  if (checking || !sessionOk) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-12 w-full max-w-md rounded-xl" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (!businessId) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Manual stock lines; link a catalog product so sales and stock-in expenses update quantity. Saving a linked line sets the stock ledger for that product to this quantity."
        actions={
          <>
            <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={downloadInventoryTemplate}>
              <Download className="h-4 w-4" aria-hidden />
              Template
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-xl"
              disabled={importing}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {importing ? 'Uploading…' : 'Bulk Upload'}
            </Button>
            <input
              ref={uploadRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void importInventoryFile(f);
                e.currentTarget.value = '';
              }}
            />
            <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </Button>
            <Button type="button" className="h-11 gap-2 rounded-xl font-semibold shadow-sm" onClick={openAdd}>
              <Plus className="h-4 w-4" aria-hidden />
              Add line
            </Button>
          </>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-primary/15 bg-gradient-to-br from-card to-accent/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Inventory value (qty × unit cost)</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{formatInrDisplay(totalValue)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Total units (all lines)</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{totalUnits.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or unit…"
          className="rounded-xl pl-10"
        />
      </div>

      <Card className="overflow-hidden border-border/80 shadow-md">
        <CardHeader className="pb-2">
          <h2 className="ui-section-title">Lines</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Warehouse className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No inventory lines yet.</p>
              <Button type="button" onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                Add your first line
              </Button>
            </div>
          ) : (
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
                    <TableHead className="ui-table-head text-right w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const low = isLowStock(r);
                    const val = Number(r.current_stock) * Number(r.unit_cost);
                    const linked = r.product_id ? products.find((p) => p.id === r.product_id) : null;
                    return (
                      <TableRow
                        key={r.id}
                        className={
                          low
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit inventory line' : 'Add inventory line'}</DialogTitle>
            <DialogDescription>
              Link a catalog product so sales and stock-in expenses update quantity automatically. When linked, saving
              overwrites the ledger stock for that product to match this line. Leave unlinked for off-catalog tracking
              only.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={formUnit} onChange={(e) => setFormUnit(e.target.value)} placeholder="pcs, kg, …" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Current stock *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={formStock}
                  onChange={(e) => setFormStock(e.target.value)}
                  required
                />
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
            <div className="space-y-2">
              <Label>Catalog product (optional)</Label>
              <ProductPicker
                products={products}
                triggerLabel={pickerLabel}
                onPick={(p) => {
                  setFormProductId(p.id);
                  setPickerLabel(`${p.name}${p.variant ? ` · ${p.variant}` : ''}`);
                }}
              />
              {pickerLabel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setFormProductId(null);
                    setPickerLabel(undefined);
                  }}
                >
                  Clear product link
                </Button>
              ) : null}
            </div>
            <Button type="submit" size="full" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={linkChoiceOpen} onOpenChange={setLinkChoiceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save without catalog product?</AlertDialogTitle>
            <AlertDialogDescription>
              This line will not sync with sales or stock-in expenses until you link a product. You can create a stub in
              Products (category GENERAL, MRP = unit cost) and link it now, or save unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void handleSaveUnlinked()}>
              Save unlinked
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSaveWithStub()}>
              Create in Products &amp; save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
