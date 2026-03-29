'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Download, Pencil, Plus, RefreshCw, Search, Trash2, Upload, Package2 } from 'lucide-react';
import { formatInrDisplay } from '@/lib/formatInr';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import { buildImportIssuesCsv, getOptionalNumber, getRequiredNumber, getString, parseCsv, type ImportIssue } from '@/lib/importCsv';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Product } from '@/lib/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
import { ProductsMobileList } from '@/app/products/components/ProductsMobileList';
import { getProductMargin, productMarginToneClass } from '@/lib/products/productMargin';

/**
 * V1 Product Repository: CRUD for tenant-scoped products.
 * business_id from profiles; RLS enforces isolation.
 */
export default function ProductsPage() {
  const session = useBusinessSession({ onMissingBusiness: 'error' });
  const businessId = session.kind === 'ready' ? session.businessId : null;
  const userEmail = session.kind === 'ready' ? session.email : null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formVariant, setFormVariant] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formMrp, setFormMrp] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formHsn, setFormHsn] = useState('');
  const [formTax, setFormTax] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const productsUploadRef = useRef<HTMLInputElement | null>(null);

  const loadProducts = useCallback(async () => {
    const supabase = getSupabaseClient();
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setProducts((data as Product[]) ?? []);
  }, []);

  useEffect(() => {
    if (!businessId) return;
    void loadProducts();
  }, [businessId, loadProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const inName = p.name.toLowerCase().includes(q);
      const inCategory = p.category.toLowerCase().includes(q);
      const inVariant = (p.variant ?? '').toLowerCase().includes(q);
      return inName || inCategory || inVariant;
    });
  }, [products, searchQuery]);

  function resetForm() {
    setEditingId(null);
    setFormName('');
    setFormVariant('');
    setFormCategory('');
    setFormMrp('');
    setFormCost('');
    setFormHsn('');
    setFormTax('');
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function startEdit(row: Product) {
    setEditingId(row.id);
    setFormName(row.name);
    setFormVariant(row.variant ?? '');
    setFormCategory(row.category);
    setFormMrp(String(row.mrp));
    setFormCost(String(row.cost_price));
    setFormHsn(row.hsn_code ?? '');
    setFormTax(row.tax_pct != null ? String(row.tax_pct) : '');
    setDialogOpen(true);
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) resetForm();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;

    const mrp = Number(formMrp);
    const cost = Number(formCost);
    const taxRaw = formTax.trim();
    const taxPct = taxRaw === '' ? null : Number(taxRaw);

    if (!Number.isFinite(mrp) || mrp < 0) {
      setError('MRP must be a number ≥ 0');
      toast.error('MRP must be a number ≥ 0');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError('Cost price must be a number ≥ 0');
      toast.error('Cost price must be a number ≥ 0');
      return;
    }
    if (taxPct !== null) {
      if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
        setError('Tax % must be between 0 and 100 when provided');
        toast.error('Tax % must be between 0 and 100 when provided');
        return;
      }
    }

    const variantTrimmed = formVariant.trim();
    const payload = {
      business_id: businessId,
      name: formName.trim(),
      variant: variantTrimmed === '' ? null : variantTrimmed,
      category: formCategory.trim(),
      mrp,
      cost_price: cost,
      hsn_code: formHsn.trim() === '' ? null : formHsn.trim(),
      tax_pct: taxPct,
    };

    if (!payload.name || !payload.category) {
      setError('Product name and category are required');
      toast.error('Product name and category are required');
      return;
    }

    const supabase = getSupabaseClient();
    setSaving(true);
    setError(null);

    if (editingId) {
      const { error: upErr } = await supabase
        .from('products')
        .update({
          name: payload.name,
          variant: payload.variant,
          category: payload.category,
          mrp: payload.mrp,
          cost_price: payload.cost_price,
          hsn_code: payload.hsn_code,
          tax_pct: payload.tax_pct,
        })
        .eq('id', editingId)
        .eq('business_id', businessId)
        .is('deleted_at', null);

      setSaving(false);
      if (upErr) {
        setError(upErr.message);
        toast.error(upErr.message);
        return;
      }
      toast.success('Product updated');
    } else {
      const { error: insErr } = await supabase.from('products').insert(payload);
      setSaving(false);
      if (insErr) {
        setError(insErr.message);
        toast.error(insErr.message);
        return;
      }
      toast.success('Product added');
    }

    resetForm();
    setDialogOpen(false);
    await loadProducts();
  }

  async function confirmArchive() {
    const id = archiveTargetId;
    if (!businessId || !id) return;
    setArchiveTargetId(null);

    const supabase = getSupabaseClient();
    setError(null);
    const { error: delErr } = await supabase.rpc('archive_product', {
      p_product_id: id,
    });

    if (delErr) {
      setError(delErr.message);
      toast.error(delErr.message);
      return;
    }
    toast.success('Product archived');
    if (editingId === id) resetForm();
    await loadProducts();
  }

  function downloadProductsTemplate() {
    const headers = ['name', 'category', 'mrp', 'cost_price', 'hsn_code', 'tax_pct', 'variant'];
    const rows = [
      {
        name: 'Sample Product',
        category: 'GENERAL',
        mrp: '1000',
        cost_price: '700',
        hsn_code: '',
        tax_pct: '18',
        variant: '',
      },
    ];
    downloadCsv('template_products.csv', rowsToCsv(headers, rows));
  }

  async function importProductsFile(file: File) {
    if (!businessId) return;
    setImporting(true);
    const text = await file.text();
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];
    const valid: { rowNo: number; payload: Record<string, unknown> }[] = [];

    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const name = getString(r, 'name');
      const category = getString(r, 'category');
      const mrp = getRequiredNumber(r, 'mrp');
      const cost = getRequiredNumber(r, 'cost_price');
      const tax = getOptionalNumber(r, 'tax_pct');

      if (!name) issues.push({ row: rowNo, field: 'name', message: 'required' });
      if (!category) issues.push({ row: rowNo, field: 'category', message: 'required' });
      if (mrp === null || mrp < 0) issues.push({ row: rowNo, field: 'mrp', message: 'must be >= 0 number' });
      if (cost === null || cost < 0) issues.push({ row: rowNo, field: 'cost_price', message: 'must be >= 0 number' });
      if (tax !== null && (tax < 0 || tax > 100)) issues.push({ row: rowNo, field: 'tax_pct', message: 'must be between 0 and 100' });

      if (name && category && mrp !== null && mrp >= 0 && cost !== null && cost >= 0) {
        valid.push({
          rowNo,
          payload: {
            business_id: businessId,
            name,
            category,
            mrp,
            cost_price: cost,
            hsn_code: getString(r, 'hsn_code') || null,
            tax_pct: tax,
            variant: getString(r, 'variant') || null,
          },
        });
      }
    });

    let inserted = 0;
    if (valid.length > 0) {
      const supabase = getSupabaseClient();
      for (const v of valid) {
        const { error: insErr } = await supabase.from('products').insert(v.payload);
        if (insErr) issues.push({ row: v.rowNo, field: 'row', message: insErr.message });
        else inserted += 1;
      }
      await loadProducts();
    }

    setImporting(false);
    if (issues.length > 0) {
      downloadCsv('products_import_errors.csv', buildImportIssuesCsv(issues));
    }
    toast.success(`Products import complete: ${inserted} inserted, ${issues.length} failed.`);
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Product Repository"
        description="Master list of all products and their category mappings."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl text-sm md:h-11 md:text-base"
              onClick={downloadProductsTemplate}
            >
              <Download className="h-4 w-4" aria-hidden />
              Template
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl text-sm md:h-11 md:text-base"
              onClick={() => productsUploadRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-4 w-4" aria-hidden />
              {importing ? 'Uploading…' : 'Bulk Upload'}
            </Button>
            <input
              ref={productsUploadRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void importProductsFile(file);
                e.currentTarget.value = '';
              }}
            />
            <Button
              type="button"
              onClick={openAdd}
              className="h-10 gap-2 rounded-xl text-sm font-semibold shadow-sm md:h-11 md:text-base"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add Product
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="rounded-xl pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2 rounded-xl border-border/80 text-sm font-semibold md:h-11 md:text-base"
          onClick={() => void loadProducts()}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="overflow-hidden border-border/80 shadow-md">
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading products…</p>
            ) : products.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Package2 className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">No products yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add your first product</p>
                </div>
                <Button
                  type="button"
                  onClick={openAdd}
                  className="h-10 gap-2 text-sm md:h-11 md:text-base"
                >
                  <Plus className="h-4 w-4" />
                  Add your first product
                </Button>
              </div>
            ) : (
              <>
                <div className="md:hidden">
                  <ProductsMobileList
                    products={filteredProducts}
                    onEdit={startEdit}
                    onArchive={setArchiveTargetId}
                    onAdd={openAdd}
                  />
                </div>
                <div className="hidden md:block">
                  {filteredProducts.length === 0 ? (
                    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                      <p className="text-sm font-medium text-foreground">No matching products</p>
                      <p className="text-sm text-muted-foreground">Try a different search term.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                    <TableHead className="ui-table-head">Product name</TableHead>
                    <TableHead className="ui-table-head">Category</TableHead>
                    <TableHead className="ui-table-head">Variant</TableHead>
                    <TableHead className="ui-table-head text-right">MRP</TableHead>
                    <TableHead className="ui-table-head text-right">Cost</TableHead>
                    <TableHead className="ui-table-head text-right">Margin</TableHead>
                    <TableHead className="ui-table-head text-right w-[110px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => {
                    const m = getProductMargin(p);

                    return (
                      <TableRow key={p.id} className="hover:bg-muted/40">
                        <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="rounded-md text-[10px] font-bold uppercase tracking-wide">
                            {p.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{p.variant ?? '—'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatInrDisplay(Number(p.mrp))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInrDisplay(Number(p.cost_price))}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${productMarginToneClass(m.tone)}`}
                        >
                          {m.label}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              aria-label="Edit"
                              onClick={() => startEdit(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              aria-label="Archive"
                              onClick={() => setArchiveTargetId(p.id)}
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
                  )}
                </div>
              </>
            )}
          </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit product' : 'Add New Product to Repository'}</DialogTitle>
              <DialogDescription>Fill in the details below.</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" required>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </Field>
                <Field label="Category" required>
                  <Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required />
                </Field>
                <Field label="Variant (optional)">
                  <Input value={formVariant} onChange={(e) => setFormVariant(e.target.value)} />
                </Field>
                <Field label="MRP" required>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={formMrp}
                    onChange={(e) => setFormMrp(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Cost" required>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    required
                  />
                </Field>
                <Field label="HSN (optional)">
                  <Input value={formHsn} onChange={(e) => setFormHsn(e.target.value)} />
                </Field>
                <Field label="Tax % (optional)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    value={formTax}
                    onChange={(e) => setFormTax(e.target.value)}
                  />
                </Field>
              </div>
              <Button type="submit" size="full" disabled={saving} className="mt-2">
                {saving ? 'Saving…' : 'Save Product'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={archiveTargetId !== null} onOpenChange={(open) => !open && setArchiveTargetId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Archive product</DialogTitle>
              <DialogDescription>Are you sure you want to archive this product?</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setArchiveTargetId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void confirmArchive()}
              >
                Archive
              </Button>
            </div>
          </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}
