'use client';

import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { Customer } from '@/lib/types/customer';
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
 * Saved-customer combobox for Sales (same interaction pattern as VendorPicker on Expenses).
 * Picking fills caller-controlled fields; clearing resets walk-in entry. `save_sale` still links
 * `customer_id` by phone when phone is present.
 */
export function CustomerPicker({
  customers,
  onPick,
  triggerLabel,
  onClear,
}: {
  customers: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>[];
  onPick: (c: Pick<Customer, 'id' | 'name' | 'phone' | 'address'>) => void;
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
            <span className="truncate text-left">{triggerLabel || 'Search saved customer…'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Name or phone…" />
            <CommandList>
              <CommandEmpty>No match</CommandEmpty>
              <CommandGroup>
                {customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.phone ?? ''} ${c.address ?? ''} ${c.id}`}
                    onSelect={() => {
                      onPick(c);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.phone ? <span className="text-muted-foreground"> · {c.phone}</span> : null}
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
