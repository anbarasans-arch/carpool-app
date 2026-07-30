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

## Known gaps (from Phase 1 work, 2026-07-30)

- [ ] **LocationPicker (map picker) is web-only.** Native (iOS/Android) currently shows a
      "Map picker is available on web for now" fallback text instead of a real picker.
      MapLibre GL JS is a web/DOM library; native support needs a different package
      (e.g. `@maplibre/maplibre-react-native`) - fine to defer since we're web-first, but
      needs solving before the iOS/Android phase.
- [ ] **MapLibre's worker script loads from unpkg's CDN at runtime**
      (`maplibregl.setWorkerUrl(...)` in `components/LocationPicker.tsx`), worked around
      because Metro's dev server (and possibly Expo's static web export too - not fully
      confirmed for the export build, only spot-checked that the built bundle references
      the right URL) doesn't serve maplibre-gl's own worker chunk correctly. This makes
      the map picker depend on unpkg.com being reachable. Worth revisiting to self-host
      the worker file (e.g. copy it into `assets/` and reference it locally) so the app
      doesn't have a runtime dependency on a third-party CDN for a core feature.
- [ ] **Cost-split uses straight-line distance, not real driving distance.**
      `set_suggested_cost_split_trigger` (migration `20260730130852`) uses PostGIS
      `ST_Distance` between trip origin/destination - a reasonable MVP stand-in, but
      PROJECT.md's stack table calls for a routing API (e.g. OpenRouteService free tier)
      for actual driving distance/ETA. Swap this in once that's set up - another account
      signup, similar to MapTiler/LocationIQ.
- [ ] **Seat inventory isn't decremented.** `trips.seats_available` never decreases when
      a match is confirmed, so a fully-booked trip can still show up as a candidate and
      accept more matches than it has room for. Fine at pilot scale with manual
      coordination, but worth fixing (e.g. a trigger on match confirmation) before real
      usage.

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
