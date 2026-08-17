-- TEMPORARY VALIDATION MODE (2026-08-03): matches the widened
-- ALLOWED_EMAIL check in supabase/functions/request-otp/index.ts - sign-in
-- is open to any email domain for now (not just the company domain plus
-- @gmail.com from the earlier test-domain migration), so beta testers
-- beyond the solo builder can validate the app without touching real
-- company work inboxes. Keeps a basic email-format check (defense in
-- depth, same shape as the Edge Function's own validation), just drops the
-- domain restriction. REVERT before any real internal rollout - see
-- FOLLOWUPS.md.
alter table public.users drop constraint users_email_check;
alter table public.users add constraint users_email_check
  check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');
