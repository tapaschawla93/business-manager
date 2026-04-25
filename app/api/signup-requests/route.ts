import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Payload = { email?: string; password?: string; businessName?: string };

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function statusForSignupRequestError(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes('already exists')) return 409;
  if (normalized.includes('required') || normalized.includes('at least')) return 400;
  if (normalized.includes('not pending') || normalized.includes('expired')) return 409;
  return 500;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const email = (body.email ?? '').trim();
    const password = body.password ?? '';
    const businessName = (body.businessName ?? '').trim();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!businessName) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 });
    }
    const supabase = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const emailNorm = normalizeEmail(email);
    const { data, error } = await supabase.rpc('create_signup_request', {
      p_email: emailNorm,
      p_business_name: businessName,
      p_password: password,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: statusForSignupRequestError(error.message) }
      );
    }
    return NextResponse.json({ ok: true, requestId: data ?? null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not submit signup request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

