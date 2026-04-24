# Feature Implementation Plan

**Overall Progress:** `100%`

## TLDR
Show the signed-in business name as the sidebar brand title, and add owner-only team invitations (email-based) with up to 3 pending invites, plus Settings controls to list/remove members and manage pending invites.

## Critical Decisions
- Decision 1: Sidebar brand title only is dynamic - exactly matches requested branding scope.
- Decision 2: Signup keeps current behavior with fallback `My Business` - preserves current onboarding path.
- Decision 3: Invitation flow is owner-only and email-based - enforces controlled business access with no alternate join UI.
- Decision 4: Limit is max 3 pending invites per business - matches confirmed option A.
- Decision 5: Removed members lose tenant access immediately - aligns with confirmed option A behavior.

## Tasks:

- [x] 🟩 **Step 1: Add team-invite data model + SQL API**
  - [x] 🟩 Add migration for multi-member businesses (drop unique `profiles.business_id`).
  - [x] 🟩 Add business owner marker and invitation table.
  - [x] 🟩 Add owner-only RPCs: invite/list/revoke/list-members/remove/accept.
  - [x] 🟩 Sync `supabase/schema.sql` with the new DB contract.

- [x] 🟩 **Step 2: Add client query/types layer for team management**
  - [x] 🟩 Add team types for members and invitations.
  - [x] 🟩 Add query helpers for new RPCs and invite email trigger.
  - [x] 🟩 Add post-auth invite acceptance helper.

- [x] 🟩 **Step 3: Update login/onboarding flow**
  - [x] 🟩 Accept invite first on auth success.
  - [x] 🟩 Create business only when no accepted invite exists.
  - [x] 🟩 Keep blank business name fallback to `My Business`.

- [x] 🟩 **Step 4: Make sidebar brand title dynamic**
  - [x] 🟩 Replace static `BizManager` title with current business name.
  - [x] 🟩 Keep robust fallback while loading/missing.

- [x] 🟩 **Step 5: Add Settings team management UI**
  - [x] 🟩 Create Team Members settings card.
  - [x] 🟩 Add owner-only invite form + pending invites list.
  - [x] 🟩 Add members list + remove member action.

- [x] 🟩 **Step 6: Verify + polish**
  - [x] 🟩 Run lint/type checks on changed files.
  - [x] 🟩 Update docs/changelog with team invite behavior.
  - [x] 🟩 Update this plan statuses and final progress to 100%.
