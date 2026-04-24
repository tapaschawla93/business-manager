'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function BusinessNameSettingsCard({ businessId }: { businessId: string | null }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('businesses').select('name').eq('id', businessId).maybeSingle();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName(((data?.name as string | undefined) ?? '').trim());
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!businessId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Business name cannot be empty');
      return;
    }
    setSaving(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('businesses').update({ name: trimmed }).eq('id', businessId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Business name saved');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bizmanager:business-name-updated', { detail: trimmed }));
    }
  }

  if (!businessId) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business name</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Business name</CardTitle>
        <CardDescription>
          Shown in the sidebar. New accounts use the name you enter at sign-up; you can change it here anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="settings-business-name">Name</Label>
          <Input
            id="settings-business-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoComplete="organization"
          />
        </div>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
