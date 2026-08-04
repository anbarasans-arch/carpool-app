# Follow-ups

Things flagged during the build that don't need solving right now, but shouldn't get
forgotten before a real rollout. Check items off as they're done; don't delete them, so
there's a record of what was considered.

See also `PROJECT.md` section 7 ("Open flags") for the pre-existing HR/Legal and data
privacy items from the original spec - not repeated here.

## ⚠️ Temporary validation mode - revert before real internal rollout

- [ ] **Sign-in is open to ANY email domain, not just the company's.** Widened
      2026-08-03 (supersedes the narrower 2026-08-02 @gmail.com-only allowance below) -
      the company wouldn't sanction sending automated validation/test emails to real
      work inboxes, so broader beta testers (not just the solo builder) need a way in
      that doesn't touch those inboxes. **Real, deliberate risk while this is on:**
      anyone who finds the URL can create an account and see other testers' contact
      info once matched - fine for an invite-only validation group, not fine left on
      indefinitely. Two places to revert before a real internal rollout: set
      `EMAIL_VALIDATION_MODE = false` in `supabase/functions/request-otp/index.ts`
      (redeploy after - the actual domain it'll enforce lives in the
      `ALLOWED_EMAIL_DOMAIN` Supabase secret, not in this repo) and also revert its
      sign-in copy ("Enter your email" / "you@example.com" back to the
      company-domain-specific versions), and run a migration reverting
      `users_email_check` back to the company-domain-only check (undoes
      `supabase/migrations/20260803020000_open_all_domains_validation.sql`, which
      itself superseded `20260802060000_allow_test_domain.sql`).

## Infra / deployment

- [x] **Buy a real domain.** Bought `lets-carpool.com` via Cloudflare Registrar
      (2026-08-01). Root domain still free for the app's own URL later; email sends from
      the `mail.lets-carpool.com` subdomain to avoid DNS conflicts with that.
- [x] **Verify the domain with Resend.** Verified 2026-08-01 (DKIM + SPF + optional DMARC
      all added in Cloudflare DNS). Sender updated in both places - `.env.local` /
      `supabase config push` (Auth SMTP) and `supabase secrets set` (the `notify-match`
      function) - to `noreply@mail.lets-carpool.com` / "Let's Carpool". Real delivery to
      an actual company-domain inbox confirmed working, including the code-based template
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

## Matching (2026-08-02)

- [x] **Matching was one-directional (rider searches trips only).** A driver posting a
      trip had no way to discover nearby open ride requests that already existed - they
      could only wait for a rider to come find them. Fixed with bidirectional matching
      (`supabase/migrations/20260802090000_bidirectional_matching.sql` +
      `20260802100000` + `20260802110000`):
      - `find_candidate_riders(trip_id)` (security definer, driver-ownership-checked)
        mirrors `find_candidate_trips` in reverse - shown on PostTripScreen right after
        posting, with an "Invite this rider" button per candidate.
      - `matches.proposed_by` (server-set by trigger, never client-trusted) tracks who
        initiated a match, so `notify-match` and the confirm/decline UI work generically
        regardless of direction - whoever did NOT propose is the one who needs to
        respond.
      - Two real bugs found and fixed during verification (both against live test
        accounts under real RLS, not just service-role): (1) the seat-decrement trigger
        from `20260802080000` only worked when the *driver* confirmed, since it ran as
        invoker and a rider has no RLS rights to update someone else's trip - now
        `security definer`. (2) the matches UPDATE policy was still
        `"Drivers can confirm or decline matches for own trips"` (driver-only, a leftover
        from migration `20260730125139` predating bidirectional matching) - replaced
        with a policy scoped to "whoever did not propose", which also generalizes the
        original self-confirmation protection correctly.
- [x] **"Option 2": proactive notification when a match appears later, not just at
      post-time.** Fixed 2026-08-03
      (`supabase/migrations/20260803000000_enable_pg_net.sql` +
      `20260803010000_proactive_match_notifications.sql`). A NEW trip or ride request now
      emails anyone with a standing match, the moment it's posted - not just people who
      happen to already exist as candidates. Since the person to notify isn't the one
      performing the action, this runs from a Postgres trigger (`pg_net` for the
      outbound HTTP call to Resend, `vault` holds the Resend API key since Postgres can't
      read Deno/Edge Function secrets - the actual key was seeded via the Supabase SQL
      Editor, never committed to a file). Deliberately does NOT create a `matches` row -
      it's a heads-up, not a proposal, to avoid spamming the matches table and
      misrepresenting consent. Verified end-to-end (both directions, including a trip
      matching multiple open requests) by checking `net._http_response` for real Resend
      message IDs, not just that the trigger ran.
      - The email links to My Rides (`?tab=rides`), which previously had no way to view
        candidates for an *existing* trip/request (`find_candidate_riders` /
        `find_candidate_trips` were only ever called right after posting). Fixed by
        extracting the candidate-list UI into shared `CandidateRidersList` /
        `CandidateTripsList` components (used by PostTripScreen/RequestRideScreen *and*
        a new "View candidates" toggle per trip/request in MyRidesScreen), so the
        notification is actually actionable instead of a dead end.
      - One real setup mistake caught during verification: the vault secret was first
        seeded with the literal placeholder text from the instructions instead of the
        real key (Resend rejected it with "API key is invalid") - fixed via
        `vault.update_secret`. Worth remembering if this secret ever needs rotating.

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
