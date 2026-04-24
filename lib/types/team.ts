export type TeamMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_owner: boolean;
};

export type PendingInvitation = {
  id: string;
  invited_email: string;
  expires_at: string;
  created_at: string;
};
