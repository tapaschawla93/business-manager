import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingInvitation, TeamMember } from '@/lib/types/team';

type Result<T> = { data: T; error: Error | null };

export async function fetchTeamMembers(supabase: SupabaseClient): Promise<Result<TeamMember[]>> {
  const { data, error } = await supabase.rpc('list_business_members');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data as TeamMember[] | null) ?? [], error: null };
}

export async function fetchPendingInvitations(supabase: SupabaseClient): Promise<Result<PendingInvitation[]>> {
  const { data, error } = await supabase.rpc('list_business_pending_invitations');
  if (error) return { data: [], error: new Error(error.message) };
  return { data: (data as PendingInvitation[] | null) ?? [], error: null };
}

export async function createBusinessInvitation(
  supabase: SupabaseClient,
  invitedEmail: string,
): Promise<Result<{ id: string; invited_email: string; expires_at: string } | null>> {
  const email = invitedEmail.trim();
  if (!email) return { data: null, error: new Error('Invite email is required') };
  const { data, error } = await supabase.rpc('create_business_invitation', {
    p_invited_email: email,
  });
  if (error) return { data: null, error: new Error(error.message) };
  const row = ((data as Array<{ id: string; invited_email: string; expires_at: string }> | null) ?? [])[0] ?? null;
  return { data: row, error: null };
}

export async function revokeBusinessInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('revoke_business_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function removeBusinessMember(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('remove_business_member', {
    p_user_id: userId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

export async function acceptPendingBusinessInvitation(
  supabase: SupabaseClient,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('accept_business_invitation_for_current_user');
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as string | null) ?? null, error: null };
}

export async function getCurrentUserOnboardingGate(
  supabase: SupabaseClient,
): Promise<{ data: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_current_user_onboarding_gate');
  if (error) return { data: null, error: new Error(error.message) };
  return { data: (data as string | null) ?? null, error: null };
}

/**
 * Sends a login/signup magic-link email to invited user after DB invite row is created.
 * This is client-triggered and keeps redirect pinned to current local or deployed origin.
 */
export async function sendBusinessInviteEmail(
  supabase: SupabaseClient,
  invitedEmail: string,
): Promise<{ error: Error | null }> {
  const email = invitedEmail.trim();
  if (!email) return { error: new Error('Invite email is required') };
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
