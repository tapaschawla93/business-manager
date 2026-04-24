'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import {
  archiveSaleTag,
  createSaleTag,
  fetchDefaultSaleTagId,
  fetchSaleTags,
  renameSaleTag,
  updateBusinessDefaultSaleTag,
} from '@/lib/queries/saleTags';
import type { SaleTag } from '@/lib/types/saleTag';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function SaleTagsSettingsCard({ businessId }: { businessId: string | null }) {
  const [tags, setTags] = useState<SaleTag[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [{ data: list, error: e1 }, { data: def, error: e2 }] = await Promise.all([
      fetchSaleTags(supabase),
      fetchDefaultSaleTagId(supabase),
    ]);
    if (e1) {
      toast.error(e1.message);
      return;
    }
    if (e2) {
      toast.error(e2.message);
      return;
    }
    setTags(list ?? []);
    setDefaultId(def);
  }, []);

  useEffect(() => {
    if (!businessId) return;
    void refresh();
  }, [businessId, refresh]);

  async function handleCreate() {
    if (!businessId) return;
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await createSaleTag(supabase, businessId, label);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewLabel('');
    toast.success('Tag created');
    await refresh();
  }

  async function handleSetDefault(tagId: string) {
    if (!businessId) return;
    setBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await updateBusinessDefaultSaleTag(supabase, businessId, tagId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDefaultId(tagId);
    toast.success('Default tag updated');
  }

  async function handleRename(tagId: string, label: string): Promise<boolean> {
    setBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await renameSaleTag(supabase, tagId, label);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success('Tag renamed');
    await refresh();
    return true;
  }

  async function handleArchive(tagId: string) {
    if (defaultId === tagId) {
      toast.error('Choose another default before deleting this tag.');
      return;
    }
    if (
      !confirm(
        'Delete this tag permanently? Sales and expenses that used it will have no tag on that field. Default tag must be changed first.',
      )
    )
      return;
    setBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await archiveSaleTag(supabase, tagId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Tag deleted');
    await refresh();
  }

  if (!businessId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sale &amp; expense tags</CardTitle>
        <CardDescription>
          Tags classify revenue and spend. New sales and expenses default to the tag marked{' '}
          <span className="font-medium text-foreground">Default</span>. Dashboard can filter KPIs by tag.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor="new-tag">
              New tag
            </label>
            <Input
              id="new-tag"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label"
              disabled={busy}
            />
          </div>
          <Button type="button" disabled={busy || !newLabel.trim()} onClick={() => void handleCreate()}>
            Add
          </Button>
        </div>

        <ul className="space-y-2">
          {tags.map((t) => (
            <TagRow
              key={t.id}
              tag={t}
              isDefault={defaultId === t.id}
              busy={busy}
              onSetDefault={() => void handleSetDefault(t.id)}
              onRename={(label) => handleRename(t.id, label)}
              onArchive={() => void handleArchive(t.id)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TagRow({
  tag,
  isDefault,
  busy,
  onSetDefault,
  onRename,
  onArchive,
}: {
  tag: SaleTag;
  isDefault: boolean;
  busy: boolean;
  onSetDefault: () => void;
  onRename: (label: string) => Promise<boolean>;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);

  useEffect(() => {
    setLabel(tag.label);
  }, [tag.label]);

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {editing ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="sm:max-w-xs"
              disabled={busy}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || !label.trim()}
                onClick={() =>
                  void (async () => {
                    const ok = await onRename(label);
                    if (ok) setEditing(false);
                  })()
                }
              >
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-foreground">{tag.label}</span>
            {isDefault ? (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                Default
              </Badge>
            ) : null}
          </div>
        )}
      </div>
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          {!isDefault ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onSetDefault}>
              Set default
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={onArchive}>
            Delete
          </Button>
        </div>
      ) : null}
    </li>
  );
}
