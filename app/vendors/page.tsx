'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Download, Pencil, Plus, RefreshCw, Trash2, Truck, Upload } from 'lucide-react';
import { downloadCsv, rowsToCsv } from '@/lib/exportCsv';
import {
  buildImportIssuesCsv,
  getNullableString,
  getString,
  parseCsv,
  type ImportIssue,
} from '@/lib/importCsv';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { archiveVendor, fetchActiveVendors } from '@/lib/queries/vendors';
import type { Vendor } from '@/lib/types/vendor';
import { PageHeader } from '@/components/PageHeader';
import { PageLoadingSkeleton } from '@/components/layout/PageLoadingSkeleton';
import { SessionRedirectNotice } from '@/components/SessionRedirectNotice';
import { useBusinessSession } from '@/lib/auth/useBusinessSession';
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
import { VendorsMobileList } from '@/app/vendors/components/VendorsMobileList';

export default function VendorsPage() {
  const session = useBusinessSession({ onMissingBusiness: 'redirect-home' });
  const businessId = session.kind === 'ready' ? session.businessId : null;
  const uploadRef = useRef<HTMLInputElement | null>(null);
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
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);

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

  async function confirmArchive() {
    const vid = archiveTargetId;
    if (!businessId || !vid) return;
    setArchiveTargetId(null);
    const supabase = getSupabaseClient();
    const { error: arcErr } = await archiveVendor(supabase, vid);
    if (arcErr) {
      toast.error(arcErr.message);
      return;
    }
    toast.success('Vendor archived');
    await load();
  }

  if (session.kind === 'loading') {
    return <PageLoadingSkeleton />;
  }

  if (session.kind === 'redirect_login') {
    return <SessionRedirectNotice to="login" />;
  }

  if (session.kind === 'redirect_home') {
    return <SessionRedirectNotice to="home" />;
  }

  if (session.kind === 'error') {
    return <p className="text-sm text-destructive">{session.message}</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Vendors"
        description="Suppliers and partners. Pick a directory vendor on expenses for history in one place, or type a name without linking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="h-10 gap-2 rounded-xl text-sm md:h-11 md:text-base"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="h-10 gap-2 rounded-xl text-sm font-semibold shadow-sm md:h-11 md:text-base"
            >
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
              <Button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="h-10 gap-2 text-sm md:h-11 md:text-base"
              >
                <Plus className="h-4 w-4" />
                Add vendor
              </Button>
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <VendorsMobileList vendors={vendors} onArchive={(id) => setArchiveTargetId(id)} />
              </div>
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60 bg-muted/50 hover:bg-muted/50">
                        <TableHead className="ui-table-head">Name</TableHead>
                        <TableHead className="ui-table-head">Phone</TableHead>
                        <TableHead className="ui-table-head">Contact</TableHead>
                        <TableHead className="ui-table-head">Address</TableHead>
                        <TableHead className="ui-table-head">Email</TableHead>
                        <TableHead className="ui-table-head w-[120px] text-right">Actions</TableHead>
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
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" asChild>
                                <Link href={`/vendors/${v.id}`} aria-label="Edit vendor">
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                aria-label="Archive vendor"
                                onClick={() => setArchiveTargetId(v.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
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

      <Dialog open={archiveTargetId !== null} onOpenChange={(open) => !open && setArchiveTargetId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive vendor</DialogTitle>
            <DialogDescription>
              Hides this vendor from the directory and picker. Past expenses linked to this vendor stay as-is.
            </DialogDescription>
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
