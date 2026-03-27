'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Plus, RefreshCw, Truck, Upload } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import {
  buildImportIssuesCsv,
  getNullableString,
  getString,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
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
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
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

  function resetForm() {
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
  }

  function downloadVendorsTemplate() {
    const headers = ['name', 'contact_person', 'phone', 'address', 'notes', 'email'];
    const rows = [
      {
        name: 'Acme Supplies',
        contact_person: 'R. Kumar',
        phone: '9876543210',
        address: 'Mumbai',
        notes: '',
        email: '',
      },
    ];
    downloadCsv('template_vendors.csv', rowsToCsv(headers, rows));
  }

  async function importVendorsFile(file: File) {
    if (!businessId) return;
    setImporting(true);
    const text = await file.text();
    const { rows } = parseCsv(text);
    const issues: ImportIssue[] = [];
    const valid: { rowNo: number; payload: Record<string, unknown> }[] = [];

    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const n = getString(r, 'name');
      if (!n) issues.push({ row: rowNo, field: 'name', message: 'required' });
      if (n) {
        valid.push({
          rowNo,
          payload: {
            business_id: businessId,
            name: n,
            contact_person: getNullableString(r, 'contact_person'),
            phone: getNullableString(r, 'phone'),
            address: getNullableString(r, 'address'),
            notes: getNullableString(r, 'notes'),
            email: getNullableString(r, 'email'),
          },
        });
      }
    });

    let inserted = 0;
    if (valid.length > 0) {
      const supabase = getSupabaseClient();
      for (const v of valid) {
        const { error: insErr } = await supabase.from('vendors').insert(v.payload);
        if (insErr) issues.push({ row: v.rowNo, field: 'row', message: insErr.message });
        else inserted += 1;
      }
      await load();
    }

    setImporting(false);
    if (issues.length > 0) {
      downloadCsv('vendors_import_errors.csv', buildImportIssuesCsv(issues));
    }
    toast.success(`Vendors import complete: ${inserted} inserted, ${issues.length} issues.`);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!businessId || !name.trim()) return;
    const supabase = getSupabaseClient();
    setSaving(true);
    const { error: insErr } = await supabase.from('vendors').insert({
      business_id: businessId,
      name: name.trim(),
      contact_person: contactPerson.trim() === '' ? null : contactPerson.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      email: email.trim() === '' ? null : email.trim(),
      address: address.trim() === '' ? null : address.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    setSaving(false);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    toast.success('Vendor added');
    resetForm();
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
        description="Suppliers and partners. Pick a directory vendor on expenses for history in one place, or type a name without linking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={downloadVendorsTemplate}>
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
                const file = e.currentTarget.files?.[0];
                if (file) void importVendorsFile(file);
                e.currentTarget.value = '';
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} className="h-11 gap-2 rounded-xl">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button type="button" onClick={() => setDialogOpen(true)} className="h-11 gap-2 rounded-xl font-semibold shadow-sm">
              <Plus className="h-4 w-4" />
              Add vendor
            </Button>
          </div>
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card className="overflow-hidden border-border/80 shadow-md">
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                    <TableHead className="ui-table-head">Name</TableHead>
                    <TableHead className="ui-table-head">Phone</TableHead>
                    <TableHead className="ui-table-head">Contact</TableHead>
                    <TableHead className="ui-table-head">Address</TableHead>
                    <TableHead className="ui-table-head">Email</TableHead>
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
                      <TableCell className="text-muted-foreground">{v.contact_person ?? '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{v.address ?? '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground">{v.email ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New vendor</DialogTitle>
            <DialogDescription>
              Only the name is required. Optional fields help on expense forms and reports. Free-text vendors on expenses do not
              create rows here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact person</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
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
