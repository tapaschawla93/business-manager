import Link from 'next/link';

/** Shown after `router.replace` to login/home so the main area is not an infinite skeleton. */
export function SessionRedirectNotice({ to = 'login' as const }: { to?: 'login' | 'home' }) {
  const href = to === 'home' ? '/' : '/login';
  const label = to === 'home' ? 'Open dashboard' : 'Open sign in';
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
      <Link href={href} className="text-sm font-semibold text-primary underline underline-offset-4">
        {label}
      </Link>
    </div>
  );
}
