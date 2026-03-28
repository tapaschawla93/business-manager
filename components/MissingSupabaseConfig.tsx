'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shown when `NEXT_PUBLIC_SUPABASE_*` are missing so the app never calls `getSupabaseClient()` and hangs in loading states.
 */
export function MissingSupabaseConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg border-destructive/30 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">Supabase is not configured</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Add your project keys so the app can load. Without them, every page stays blank or stuck on loading.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>In the project root, create or edit <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.local</code> with:</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
            {`NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key`}
          </pre>
          <p>Restart <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run dev</code> after saving.</p>
        </CardContent>
      </Card>
    </div>
  );
}
