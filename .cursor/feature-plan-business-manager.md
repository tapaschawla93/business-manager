# Feature Implementation Plan

**Overall Progress:** `32%`

## TLDR

Multi-tenant Business Manager on Next.js + Supabase with strict per-business RLS and password auth.

## Tasks

- [x] 🟩 **Step 0: Supabase core & tenancy**
  - [x] 🟩 `businesses`, `profiles`, RLS baseline

- [x] 🟩 **Step 0b: Security & auth hardening (review fixes)**
  - [x] 🟩 Remove permissive `businesses` INSERT; onboarding via `create_business_for_user`
  - [x] 🟩 Remove client `profiles` INSERT; same RPC
  - [x] 🟩 `WITH CHECK` on `businesses` and `profiles` updates; `unique(business_id)` on profiles
  - [x] 🟩 App calls RPC after sign-in / sign-up (when session exists)

- [ ] 🟥 **Step 1+:** Domain tables, Sales, Expenses, Inventory, Dashboard
