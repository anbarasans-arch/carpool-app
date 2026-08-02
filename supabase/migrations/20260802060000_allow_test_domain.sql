-- TEMPORARY TEST MODE (2026-08-02): also allow @gmail.com in public.users so
-- the solo builder can test driver + rider flows via Gmail plus-addressing
-- without spamming their own @fmr.com inbox. Mirrors the same change in
-- supabase/functions/request-otp/index.ts. REVERT both before any wider
-- pilot rollout - see FOLLOWUPS.md.
alter table public.users drop constraint users_email_check;
alter table public.users add constraint users_email_check
  check (email like '%@fmr.com' or email like '%@gmail.com');
