'use client';

import { useRef } from 'react';
import { Download, MoreVertical, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  onDownloadTemplate: () => void;
  onFileSelected: (file: File) => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  /** e.g. "Product CSV import" */
  menuAriaLabel: string;
};

export function ModuleCsvMenu({ onDownloadTemplate, onFileSelected, busy, disabled, menuAriaLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".csv,text/csv"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void Promise.resolve(onFileSelected(file));
          e.currentTarget.value = '';
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl border-border/80"
            disabled={disabled || busy}
            aria-label={menuAriaLabel}
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onSelect={(ev) => {
              ev.preventDefault();
              onDownloadTemplate();
            }}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Download CSV template
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onSelect={(ev) => {
              ev.preventDefault();
              inputRef.current?.click();
            }}
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Upload CSV…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
