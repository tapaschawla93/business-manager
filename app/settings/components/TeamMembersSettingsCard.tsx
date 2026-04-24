'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabaseClient';
import {
  createBusinessInvitation,
  fetchPendingInvitations,
  fetchTeamMembers,
  removeBusinessMember,
  revokeBusinessInvitation,
  sendBusinessInviteEmail,
} from '@/lib/queries/teamMembers';
import type { PendingInvitation, TeamMember } from '@/lib/types/team';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function TeamMembersSettingsCard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pending, setPending] = useState<PendingInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

  const owner = useMemo(() => members.find((m) => m.is_owner) ?? null, [members]);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [{ data: memberRows, error: memberErr }, { data: inviteRows, error: inviteErr }] = await Promise.all([
      fetchTeamMembers(supabase),
      fetchPendingInvitations(supabase),
    ]);
    if (memberErr) {
      const lower = memberErr.message.toLowerCase();
      if (lower.includes('only the business creator')) {
        setPermissionMessage('Only the business creator can manage members and invitations.');
        setMembers([]);
        setPending([]);
        return;
      }
      toast.error(memberErr.message);
      return;
    }
    if (inviteErr) {
      const lower = inviteErr.message.toLowerCase();
      if (lower.includes('only the business creator')) {
        setPermissionMessage('Only the business creator can manage members and invitations.');
        setMembers([]);
        setPending([]);
        return;
      }
      toast.error(inviteErr.message);
      return;
    }
    setPermissionMessage(null);
    setMembers(memberRows);
    setPending(inviteRows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error: createErr } = await createBusinessInvitation(supabase, email);
      if (createErr) {
        toast.error(createErr.message);
        return;
      }
      const { error: mailErr } = await sendBusinessInviteEmail(supabase, email);
      if (mailErr) {
        toast.error(`Invite row created, but email send failed: ${mailErr.message}`);
      } else {
        toast.success('Invitation sent');
      }
      setInviteEmail('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(invitationId: string) {
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await revokeBusinessInvitation(supabase, invitationId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Invitation revoked');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string, email: string | null) {
    if (!confirm(`Remove ${email ?? 'this member'} from the business?`)) return;
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await removeBusinessMember(supabase, userId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success('Member removed');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Team members</CardTitle>
        <CardDescription>
          Only the business creator can invite or remove members. Up to 3 pending email invitations are allowed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground" htmlFor="invite-email">
              Invite by email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="member@example.com"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !inviteEmail.trim() || permissionMessage !== null}
            onClick={() => void handleInvite()}
          >
            Send invite
          </Button>
        </div>
        {permissionMessage ? <p className="text-sm text-muted-foreground">{permissionMessage}</p> : null}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Members</p>
          <ul className="space-y-2">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{member.email ?? 'No email'}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.is_owner ? 'Creator' : 'Member'}
                    {member.full_name ? ` · ${member.full_name}` : ''}
                  </p>
                </div>
                {!member.is_owner && permissionMessage === null ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => void handleRemove(member.user_id, member.email)}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Pending invitations ({pending.length}/3)</p>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invitations.</p>
          ) : (
            <ul className="space-y-2">
              {pending.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{invite.invited_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(invite.expires_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {owner ? (
          <p className="text-xs text-muted-foreground">
            Business creator: <span className="font-medium text-foreground">{owner.email ?? 'Unknown'}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
