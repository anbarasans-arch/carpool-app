# Follow-ups

Things flagged during the build that don't need solving right now, but shouldn't get
forgotten before a real rollout. Check items off as they're done; don't delete them, so
there's a record of what was considered.

See also `PROJECT.md` section 7 ("Open flags") for the pre-existing HR/Legal and data
privacy items from the original spec - not repeated here.

## ⚠️ Temporary test mode - revert before wider rollout

- [ ] **@gmail.com is temporarily allowed to sign in, alongside @fmr.com.** Added
      2026-08-02 so the solo builder could test driver + rider flows via Gmail
      plus-addressing (e.g. `you+driver@gmail.com` / `you+rider@gmail.com`) without
      needing multiple real @fmr.com inboxes. Two places to revert before any wider
      pilot: remove `"gmail.com"` from `ALLOWED_DOMAINS` in
      `supabase/functions/request-otp/index.ts` (redeploy the function after), and run
      a migration that drops/recreates `users_email_check` back to `@fmr.com` only
      (undoes `supabase/migrations/20260802060000_allow_test_domain.sql`).

## Infra / deployment

- [x] **Buy a real domain.** Bought `lets-carpool.com` via Cloudflare Registrar
      (2026-08-01). Root domain still free for the app's own URL later; email sends from
      the `mail.lets-carpool.com` subdomain to avoid DNS conflicts with that.
- [x] **Verify the domain with Resend.** Verified 2026-08-01 (DKIM + SPF + optional DMARC
      all added in Cloudflare DNS). Sender updated in both places - `.env.local` /
      `supabase config push` (Auth SMTP) and `supabase secrets set` (the `notify-match`
      function) - to `noreply@mail.lets-carpool.com` / "Let's Carpool". Real delivery to
      an actual `@fmr.com` inbox confirmed working, including the code-based template
      (not just a link). First attempt landed in spam/was briefly delayed - expected for
      a brand-new sending domain with no reputation yet; resolved after adding DMARC.
- [x] **Connect the root domain to the Vercel app.** Added a CNAME at `@` in Cloudflare
      pointing at Vercel's per-project target (DNS only, not proxied); Vercel flipped to
      "Valid Configuration". Confirmed live 2026-08-02 - https://lets-carpool.com loads
      the app (user verified from their phone). The Vercel-issued URL still works too.
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
      `set_suggested_cost_split_trigger` (migration `20260730130852`, updated
      `20260802070000`) uses PostGIS `ST_Distance` between trip origin/destination - a
      reasonable MVP stand-in, but PROJECT.md's stack table calls for a routing API
      (e.g. OpenRouteService free tier) for actual driving distance/ETA. Swap this in
      once that's set up - another account signup, similar to MapTiler/LocationIQ.
- [x] **Cost-split always divided by 2 regardless of seat count.** Fixed 2026-08-02
      (`supabase/migrations/20260802070000_cost_split_by_seats.sql`) - now divides by
      (1 + trip's seats_available) so a bigger trip means a cheaper suggested share per
      rider. Every match on the same trip gets the same per-rider amount. Note this
      still uses the trip's originally-posted seat count, not how many riders actually
      ended up matched, since seat inventory isn't decremented yet (see the gap below).
- [x] **Seat inventory isn't decremented.** Fixed 2026-08-02
      (`supabase/migrations/20260802080000_decrement_seats_on_confirm.sql`) - a trigger
      on `matches` decrements `trips.seats_available` when a match is confirmed, and
      blocks the confirm with a clear error ("This trip has no seats left.") if the trip
      is already full, closing the race between two matches confirmed back-to-back.
      `find_candidate_trips` already filtered on `seats_available > 0`, so a full trip
      now automatically stops showing up as a candidate - verified end-to-end (decrement,
      overbooking block, and candidate-list exclusion) against live test rows, cleaned up
      after.

## Minor rough edges (found during final review, 2026-07-31)

- [ ] **PostTripScreen/RequestRideScreen don't fully reset LocationPicker after a
      successful submit.** The parent clears its own `origin`/`destination` state, but
      LocationPicker's internal search text and map marker are local state that doesn't
      hear about that - so after "Trip posted!"/"Ride requested!" the search boxes and
      pins visually linger even though the underlying values are gone. Purely cosmetic
      (doesn't affect what gets submitted). Fix would be giving LocationPicker a `key`
      that changes on successful submit, forcing a clean remount - safe to do now that
      unmount properly cleans up the map (see the memory-leak fix in the same review).
- [ ] **Double-clicking "Request this ride" fast enough could show a raw Postgres error.**
      The button is hidden after one successful request (via React state), so this needs
      a genuine double-click before the state updates - the `matches` unique constraint on
      (trip_id, ride_request_id) correctly prevents a duplicate row either way, this is
      only about the error message being unfriendly ("duplicate key value violates unique
      constraint...") in that narrow race. Low priority.

## Product (explicitly deferred to Phase 2 in PROJECT.md)

- [ ] Recurring/scheduled trip templates.
- [ ] Admin dashboard / analytics.
- [ ] Rating/review system.

## Compliance (see PROJECT.md section 7 for full detail)

- [ ] HR/Legal review before rollout beyond a small pilot (cost-sharing/liability/IRS
      mileage questions).
- [ ] Data privacy handling for commute/home-work location data - be ready to explain
      to IT if asked.
