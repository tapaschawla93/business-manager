# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR
Add admin approval before creating brand-new business accounts: signup now creates a pending request, emails the administrator with approve/reject links, expires in 48 hours, and only approval creates auth user + business + profile. Team-member invite flow remains unchanged.

## Critical Decisions
- Decision 1: New-business signup is request-first (no immediate auth user/business) - satisfies “create pending request first, create account only after admin approves.”
- Decision 2: Admin action is email-link based (approve/reject endpoints) - matches required one-click approval workflow.
- Decision 3: Rejected/expired requests are deleted - user must re-register to submit a new request.
- Decision 4: Team member invites remain direct-to-member - no admin gate added to invite flow.

## Tasks:

- [x] 🟩 **Step 1: Add DB model for pending signup approval**
  - [x] 🟩 Add `signup_requests` table with status, token, expiry, encrypted password payload.
  - [x] 🟩 Add indexes + trigger + RLS lock-down.

- [x] 🟩 **Step 2: Build server-side admin approval plumbing**
  - [x] 🟩 Add admin Supabase server client helper (`service_role`).
  - [x] 🟩 Add password encrypt/decrypt helper for pending requests.
  - [x] 🟩 Add admin email sender utility with approve/reject links.

- [x] 🟩 **Step 3: Create API routes**
  - [x] 🟩 `POST /api/signup-requests` to create/reuse pending request and email admin.
  - [x] 🟩 `GET /api/admin-signup/approve` to create auth user + business + profile + default tag.
  - [x] 🟩 `GET /api/admin-signup/reject` to delete request.

- [x] 🟩 **Step 4: Update login UX**
  - [x] 🟩 Sign-up now submits request (not direct Supabase signUp).
  - [x] 🟩 Show “sent to administrator, wait 24–48h” message.
  - [x] 🟩 Keep sign-in behavior for approved accounts.

- [x] 🟩 **Step 5: Environment setup + schema sync**
  - [x] 🟩 Add required env vars in `.env.example`.
  - [x] 🟩 Sync `supabase/schema.sql` with new `signup_requests` model.

- [x] 🟩 **Step 6: Verify**
  - [x] 🟩 Run lints on changed files.
  - [x] 🟩 Run tests (`npm test`).
