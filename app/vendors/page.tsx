'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { fetchActiveVendors } from '@/lib/queries/vendors';
import type { Vendor } from '@/lib/types/vendor';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function VendorsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    const supabase = getSupabaseClient();
    setLoading(true);
    const { data, error: err } = await fetchActiveVendors(supabase, { businessId });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setVendors(data ?? []);
    setError(null);
  }, [businessId]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      const { data: profile, error: pe } = await supabase.from('profiles').select('business_id').single();
      if (pe || !profile?.business_id) {
        router.replace('/');
        return;
      }
      setBusinessId(profile.business_id);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!businessId) return;
    void load();
  }, [businessId, load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!businessId || !name.trim()) return;
    const supabase = getSupabaseClient();
    setSaving(true);
    const { error: insErr } = await supabase.from('vendors').insert({
      business_id: businessId,
      name: name.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      email: email.trim() === '' ? null : email.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    setSaving(false);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    toast.success('Vendor added');
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setDialogOpen(false);
    await load();
  }

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Suppliers and partners. Link them on expenses for history in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add vendor
            </Button>
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader className="pb-2">
          <h2 className="ui-section-title">Directory</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading vendors…</p>
          ) : vendors.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Truck className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No vendors yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first supplier or service provider.</p>
              </div>
              <Button type="button" onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add vendor
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium">
                      <Link href={`/vendors/${v.id}`} className="text-primary hover:underline">
                        {v.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{v.email ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New vendor</DialogTitle>
            <DialogDescription>Store contact details for quick selection on expenses.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button type="submit" size="full" disabled={saving}>
              {saving ? 'Saving…' : 'Save vendor'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
