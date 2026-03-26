'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { Product } from '@/lib/types/product';
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

/**
 * Combobox-style product search (Popover + cmdk). Same client-side filter as before; no extra queries.
 */
export function ProductPicker({
  products,
  onPick,
  triggerLabel,
}: {
  products: Product[];
  onPick: (p: Product) => void;
  /** Shown on the trigger when no line label passed from parent */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-10 w-full justify-between font-normal')}
        >
          <span className="truncate text-left">{triggerLabel || 'Search product…'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search product name…" />
          <CommandList>
            <CommandEmpty>No match</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.variant ?? ''} ${p.category}`}
                  onSelect={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  {p.variant ? <span className="text-muted-foreground"> · {p.variant}</span> : null}
                  <span className="block text-xs text-muted-foreground">{p.category}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
