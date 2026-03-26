'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, RefreshCw, Search, Trash2, Boxes, ChevronRight } from 'lucide-react';
import { formatInrDisplay } from '@/lib/formatInr';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { Product } from '@/lib/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Fab } from '@/components/Fab';
import { PageHeader } from '@/components/PageHeader';

/** UI margin from MRP & cost (catalog); not stored. */
function marginPctLabel(p: Product): string {
  const cost = Number(p.cost_price);
  if (!Number.isFinite(cost) || cost <= 0) return '—';
  const mrp = Number(p.mrp);
  if (!Number.isFinite(mrp)) return '—';
  const pct = ((mrp - cost) / cost) * 100;
  return `${pct.toFixed(1)}%`;
}

/**
 * V1 Product Repository: CRUD for tenant-scoped products.
 * business_id from profiles; RLS enforces isolation.
 */
export default function ProductsPage() {
  const router = useRouter();
  const [sessionOk, setSessionOk] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
    const supabase = getSupabaseClient();

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      setUserEmail(sessionData.session.user.email ?? null);
      setSessionOk(true);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('business_id')
        .single();

      if (profileError || !profile?.business_id) {
        setError(profileError?.message ?? 'No business profile');
        setCheckingSession(false);
        return;
      }

      setBusinessId(profile.business_id);
      setCheckingSession(false);
    }

    init();
  }, [router]);

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

  if (checkingSession || !sessionOk) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Boxes className="h-4 w-4" />
              Product Management
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Products</h1>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-border bg-muted/50 px-3 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {(userEmail?.slice(0, 2) ?? 'OW').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground" title={userEmail ?? undefined}>
                {userEmail ?? 'Owner'}
              </p>
              <p className="text-xs text-muted-foreground">Owner</p>
            </div>
          </div>
        </div>
      </section>

      <PageHeader
        title="Product Repository"
        description="Master list of all products and their category mappings"
      />

      <div className="flex flex-col justify-end gap-3 sm:flex-row">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products..."
            className="pl-9"
          />
        </div>
        <Button type="button" onClick={openAdd} className="gap-2 sm:self-start">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="ui-section-title">All Products</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse and manage your product catalog.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadProducts()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading products…</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet. Add one with Add product or +.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral" className="font-semibold">
                        {p.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.variant && p.variant.trim() !== '' ? p.variant : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatInrDisplay(Number(p.mrp))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInrDisplay(Number(p.cost_price))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {marginPctLabel(p)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          aria-label="Edit"
                          onClick={() => startEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 border-destructive/30 text-destructive hover:bg-destructive/10"
                          aria-label="Archive"
                          onClick={() => setArchiveTargetId(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {/* Keep FAB for mobile-first quick add. */}
      <Fab aria-label="Add product" onClick={openAdd} />

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Product in Repository' : 'Add New Product to Repository'}</DialogTitle>
            <DialogDescription>
              Product name and category are required. Variant is optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product name" required>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </Field>
              <Field label="Variant (optional)">
                <Input
                  value={formVariant}
                  onChange={(e) => setFormVariant(e.target.value)}
                  placeholder="e.g. 500 ml"
                />
              </Field>
              <Field label="Category" required>
                <Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required />
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
              <Field label="Cost price" required>
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
                  placeholder="0–100"
                />
              </Field>
            </div>
            <Button type="submit" size="full" disabled={saving} className="mt-2">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save product'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiveTargetId !== null} onOpenChange={(o) => !o && setArchiveTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive product?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from lists and exports. This cannot be undone from the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmArchive()}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}
