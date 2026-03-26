'use client';

import type { ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';
import { cn } from '@/lib/utils';

type ToasterProps = ComponentProps<typeof Sonner>;

const defaultToastClassNames = {
  toast:
    'group toast group-[.toaster]:rounded-card group-[.toaster]:border-border group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-lg',
  title: 'group-[.toast]:text-foreground',
  description: 'group-[.toast]:text-muted-foreground',
  success: 'group-[.toast]:border-primary/20',
  error: 'group-[.toast]:border-destructive/30',
  actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
  cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
} as const;

type SonnerToastClassNames = NonNullable<NonNullable<ToasterProps['toastOptions']>['classNames']>;

function shallowMergeToastClassNames(
  incoming?: SonnerToastClassNames,
): SonnerToastClassNames {
  // Sonner's ToastClassnames type doesn't have an index signature; merge via a loose map then cast back.
  const out: Record<string, string | undefined> = { ...defaultToastClassNames };
  if (!incoming) return out as unknown as SonnerToastClassNames;

  for (const [key, v] of Object.entries(incoming as unknown as Record<string, string | undefined>)) {
    if (v === undefined) continue;
    out[key] =
      key in defaultToastClassNames
        ? cn(defaultToastClassNames[key as keyof typeof defaultToastClassNames], v)
        : v;
  }

  return out as unknown as SonnerToastClassNames;
}

/** Sonner — duration + classes aligned with design tokens (Phase C). */
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        ...toastOptions,
        duration: toastOptions?.duration ?? 4000,
        classNames: shallowMergeToastClassNames(toastOptions?.classNames),
      }}
      {...props}
    />
  );
};

export { Toaster };
