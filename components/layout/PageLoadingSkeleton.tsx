'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** Full-width placeholder while session / profile resolves — matches list-page chrome. */
export function PageLoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Loading this page…</p>
        <Button type="button" variant="outline" size="sm" className="h-9 w-fit rounded-lg" asChild>
          <Link href="/login">Stuck? Open sign in</Link>
        </Button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-9 w-48 rounded-lg sm:h-10 sm:w-64" />
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <Skeleton className="h-11 w-32 rounded-xl" />
          <Skeleton className="h-11 w-36 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-[min(440px,58vh)] w-full rounded-card" />
    </div>
  );
}
