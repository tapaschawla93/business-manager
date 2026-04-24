'use client';

import { useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import type { SaleTag } from '@/lib/types/saleTag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Props = {
  tags: SaleTag[];
  value: string | null;
  onChange: (tagId: string) => void;
  /** Creates a tag for the tenant; should refresh `tags` and return the new id. */
  onCreateTag: (label: string) => Promise<string | null>;
  disabled?: boolean;
  /** Marks the business default in the list when `showDefaultHint` is true. */
  defaultTagId?: string | null;
  showDefaultHint?: boolean;
};

/**
 * Combobox over `sale_tags` plus inline "Add tag" dialog (insert then select).
 */
export function SaleTagPicker({
  tags,
  value,
  onChange,
  onCreateTag,
  disabled,
  defaultTagId,
  showDefaultHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const selected = tags.find((t) => t.id === value);
  const triggerLabel = selected?.label ?? (value ? 'Tag…' : 'Select tag…');

  async function submitNewTag() {
    const label = newLabel.trim();
    if (!label || creating) return;
    setCreating(true);
    try {
      const id = await onCreateTag(label);
      setNewLabel('');
      setAddOpen(false);
      if (id) {
        onChange(id);
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Tag *
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={cn('h-10 w-full justify-between font-normal')}
            >
              <span className="truncate text-left">{triggerLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tag…" />
              <CommandList>
                <CommandEmpty>No tag found</CommandEmpty>
                <CommandGroup>
                  {tags.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`${t.label} ${t.id}`}
                      onSelect={() => {
                        onChange(t.id);
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{t.label}</span>
                      {showDefaultHint && defaultTagId === t.id ? (
                        <span className="ml-2 text-[10px] text-muted-foreground">default</span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className="border-t border-border p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-full justify-start gap-2 font-medium"
                onClick={() => {
                  setAddOpen(true);
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add tag
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>New tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="sale-tag-new">Label</Label>
            <Input
              id="sale-tag-new"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Store A"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitNewTag();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={creating || !newLabel.trim()} onClick={() => void submitNewTag()}>
              {creating ? 'Saving…' : 'Create & select'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
