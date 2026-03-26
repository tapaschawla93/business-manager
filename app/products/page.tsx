'use client';

import { FormEvent, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, RefreshCw, Trash2 } from 'lucide-react';
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
      <PageHeader
        title="Product Repository"
        description="Master product list for your business."
        actions={
          <Button type="button" onClick={openAdd}>
            Add product
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <h3 className="text-base font-semibold">Products</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadProducts()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet. Add one with Add product or +.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{p.name}</div>
                      {p.variant != null && p.variant !== '' && (
                        <div className="text-xs text-muted-foreground">{p.variant}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted" className="font-semibold">
                        {p.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(Number(p.mrp))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInrDisplay(Number(p.cost_price))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {marginPctLabel(p)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Fab aria-label="Add product" onClick={openAdd} />

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit product' : 'Add product'}</DialogTitle>
            <DialogDescription>Product name and category are required. Variant is optional.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
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
