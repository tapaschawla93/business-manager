'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { Vendor } from '@/lib/types/vendor';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function VendorPicker({
  vendors,
  onPick,
  triggerLabel,
  onClear,
}: {
  vendors: Vendor[];
  onPick: (v: Vendor) => void;
  triggerLabel?: string;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('h-10 flex-1 justify-between font-normal')}
          >
            <span className="truncate text-left">{triggerLabel || 'Search vendor…'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Vendor name…" />
            <CommandList>
              <CommandEmpty>No match</CommandEmpty>
              <CommandGroup>
                {vendors.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={v.name}
                    onSelect={() => {
                      onPick(v);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{v.name}</span>
                    {v.phone ? <span className="text-muted-foreground"> · {v.phone}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onClear && triggerLabel ? (
        <Button type="button" variant="ghost" className="h-10 shrink-0 px-2 text-muted-foreground" onClick={onClear}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
