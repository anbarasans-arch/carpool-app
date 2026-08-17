-- TEMPORARY TEST MODE (2026-08-02): also allow @gmail.com in public.users so
-- the solo builder can test driver + rider flows via Gmail plus-addressing
-- without spamming their own company work inbox (domain redacted from this
-- historical migration at the company's request - see PROJECT.md). Mirrors
-- the same change in supabase/functions/request-otp/index.ts. REVERT both
-- before any wider pilot rollout - see FOLLOWUPS.md.
alter table public.users drop constraint users_email_check;
alter table public.users add constraint users_email_check
  check (email like '%@company-domain.example' or email like '%@gmail.com');
