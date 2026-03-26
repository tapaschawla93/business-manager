'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { SalesForm } from './components/SalesForm';

export default function SalesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('business_id')
        .single();

      if (error || !profile?.business_id) {
        router.replace('/');
        return;
      }

      setReady(true);
    }

    void init();
  }, [router]);

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">New sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search product, set quantity and selling price, then save. Server stores snapshots and totals.
        </p>
      </div>
      <SalesForm />
    </div>
  );
}
