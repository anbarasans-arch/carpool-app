# Follow-ups

Things flagged during the build that don't need solving right now, but shouldn't get
forgotten before a real rollout. Check items off as they're done; don't delete them, so
there's a record of what was considered.

See also `PROJECT.md` section 7 ("Open flags") for the pre-existing HR/Legal and data
privacy items from the original spec - not repeated here.

## Infra / deployment

- [ ] **Buy a real domain** (~$10-15/year, e.g. via Namecheap or Cloudflare Registrar).
      Needed to verify a sending domain with Resend (can't use gmail.com or fmr.com -
      you don't control DNS for either), and doubles as the app's real URL on Vercel
      instead of a generic `*.vercel.app` address.
- [ ] **Verify the domain with Resend** once purchased, then update
      `RESEND_SENDER_EMAIL` / `RESEND_SENDER_NAME` in `.env.local` and run
      `supabase config push`. Currently sending from Resend's sandbox address
      (`onboarding@resend.dev`), which only delivers to the Resend account's own email -
      not to real `@fmr.com` coworkers yet.
- [ ] **Revisit the email send rate limit** (`auth.rate_limit.email_sent` in
      `supabase/config.toml`, currently 30/hour project-wide). Fine for testing and a
      small pilot; may need to go higher before a wider rollout.
- [ ] **Apple Developer account** ($99/year) - needed once iOS distribution
      (TestFlight) starts, per `PROJECT.md`'s stack table. Not needed yet since we're
      web-first.

## Product (explicitly deferred to Phase 2 in PROJECT.md)

- [ ] Geofence validation - reject trip creation outside the 50mi Dallas radius, with a
      clear error message.
- [ ] Recurring/scheduled trip templates.
- [ ] Admin dashboard / analytics.
- [ ] Rating/review system.

## Compliance (see PROJECT.md section 7 for full detail)

- [ ] HR/Legal review before rollout beyond a small pilot (cost-sharing/liability/IRS
      mileage questions).
- [ ] Data privacy handling for commute/home-work location data - be ready to explain
      to IT if asked.
