# Company Carpool App — Project Spec

**Status:** Pre-build / planning
**Builder:** Solo, non-technical, ~few hours/week, building with Claude Code
**Goal:** MVP to demo internally; company may adopt and move to their own cloud after

---

## 1. What this is

An internal carpooling app for employees of one company, matching drivers and riders
for commutes to/from a single office (Dallas). Not a public product. Not a commercial
ride-hailing business — closer to a company-sponsored rideshare board than an Uber clone.

## 2. Hard requirements

- **Auth:** work email only. User enters email → receives a 6-digit one-time code →
  enters code → verified → gains access. **Only emails ending in `@fmr.com` may
  request a code at all** — reject before sending, don't just reject after.
- **Geofence:** all trips must have origin and destination within **50 miles** of the
  Dallas office coordinates. Reject trip creation outside this radius.
- **Scale target:** up to **20,000 users total** (drivers + riders combined), single
  metro area. This is a small scale for the stack below — no need for heavy geo-indexing
  (H3, Redis) at this size; plain PostGIS queries are fine indefinitely.
- **Matching model:** request-now / same-day matching, not live GPS tracking during
  the ride. Driver and rider see each other's contact info once matched and coordinate
  the actual pickup themselves (like a text message would).
- **Money:** app shows a **suggested cost split** (simple formula off distance), no
  in-app payment processing in MVP. Settlement happens outside the app.
- **Hosting:** independent (not on company infra) for MVP. Company may migrate this to
  their own cloud after a successful demo — build with that migration in mind (avoid
  vendor-specific lock-in where cheap to do so, e.g. standard Postgres over a
  proprietary DB).
- **Platforms:** targeting **Web, iOS, and Android**, all from one codebase. Build order
  is **Web first** (fastest iteration, no simulator/build step, easy to demo via a link),
  then add iOS/Android native builds once the core loop works on web.

## 3. Explicitly out of scope for MVP

Do not build these yet, even if they seem natural to add:

- Live GPS tracking / moving map during a ride
- In-app payments or Stripe integration
- Push notifications via native mobile (web push is enough)
- Native iOS/Android apps (see stack — start as a web app)
- Driver background checks / ID verification (closed employee population; revisit if
  the company formally adopts this)
- Recurring/scheduled trip templates (nice-to-have, Phase 2)
- Admin dashboard / analytics (Phase 2)
- Rating/review system (Phase 2, low priority given closed trusted population)

## 4. Recommended stack (optimized for: solo, non-technical, low ops burden, near-zero cost at MVP scale)

| Layer | Pick | Why |
|---|---|---|
| App | **React Native via Expo, with Expo web (React Native Web) enabled** — one codebase for Web, iOS, and Android. Build web first (deployed to Vercel), add iOS/Android later via EAS Build, distributed internally (TestFlight / Play Console internal testing track) — not a public store listing | One codebase reaches all three target platforms instead of maintaining a separate Next.js app. Web gives the fastest iteration loop for early phases (no simulator, just a browser reload) and an easy demo link; native builds get added once the core loop is proven, without a rewrite. Internal-only distribution skips public app review entirely. EAS Build produces installable binaries without needing Xcode/Android Studio locally. One-time setup cost: $99/yr Apple Developer account + TestFlight/Play internal track configuration, needed only when the iOS/Android phase starts. |
| Backend + DB | **Supabase** (hosted Postgres + PostGIS + Auth + Realtime + Edge Functions) | One managed service covers database, geospatial queries, auth, and serverless functions. Free tier covers MVP scale. Open source under the hood (you could self-host later), zero ops for now. |
| Auth | Supabase Auth, **email OTP**, with a domain check in an Edge Function before issuing a code | Rejects non-`@fmr.com` emails before a code is ever sent. |
| Matching logic | Postgres/PostGIS `ST_DWithin` + time-window filter, run as a Supabase Edge Function or simple query | Plenty fast at 20k users. No Redis, no H3 — that complexity solves a problem you don't have at this scale. |
| Maps (display) | **MapLibre GL JS** | Free, open source, no Google Maps billing risk. |
| Map tiles | Hosted free tier (e.g. MapTiler or Stadia Maps free plan) for MVP | Self-hosting tiles is real ops work — defer until usage actually justifies it. |
| Geocoding (address → coords) | A hosted OSM-based geocoding API free tier (e.g. LocationIQ, Geoapify, OpenCage) | Avoids self-hosting Nominatim; free tiers comfortably cover MVP volume. |
| Distance/ETA for cost-split calc | A hosted routing API free tier (e.g. OpenRouteService) | Avoids self-hosting OSRM for now. |
| Hosting | **Vercel** (frontend) + Supabase (backend) | Both have free tiers that likely cover the whole MVP. Realistic all-in cost: **$0–25/month**. |
| Email delivery (OTP) | Supabase's built-in email, or Resend free tier if deliverability issues appear | |

**Total realistic MVP infra cost: $0–25/month**, plus **$99/year** for the Apple Developer
account needed for internal iOS distribution. Everything else here is either open source or
has a clear migration path to self-hosted open source later.

**Why Expo (web + native) instead of a separate Next.js app:** the app targets Web, iOS, and
Android. Since this is internal-only, native distribution can go through TestFlight (iOS) and
the Play Console internal testing track (Android) rather than public app store review — which
removes the main reason (review delays/rejection risk while iterating solo) to prefer a
web-only app long-term. But building web first inside the same Expo codebase means the early
phases stay fast to iterate (just a browser reload, easy demo link) without throwing away work
or duplicating the app in a second framework once iOS/Android get added.

## 5. Data model (starting point — will evolve)

```
users
  id, email, verified_at, created_at

trips  (a driver posting "I'm driving this route")
  id, driver_id, origin_point (geography), destination_point (geography),
  departure_time, seats_available, status, created_at

ride_requests  (a rider looking for a match)
  id, rider_id, origin_point, destination_point, desired_time_window,
  status, created_at

matches
  id, trip_id, ride_request_id, status (pending/confirmed/declined),
  suggested_cost_split, created_at
```

## 6. Phased build plan (sized for a few hours/week)

**Phase 0 — Foundation (few sessions) - DONE (2026-07-30)**
- [x] Supabase project setup, Postgres schema, PostGIS enabled
- [x] Email OTP auth working end-to-end, with domain restriction (real delivery to
      arbitrary @fmr.com addresses pending a verified sending domain - see FOLLOWUPS.md)
- [x] Expo app scaffold (web target via Expo web/React Native Web), deployed to Vercel
      at https://carpool-app-mu.vercel.app, auth flow confirmed live in browser

**Phase 1 — Core loop (several sessions) - IN PROGRESS (started 2026-07-30)**
- [x] Driver can post a trip (origin, destination, time, seats) via a form + map picker.
      LocationPicker component (address search via LocationIQ + MapLibre/MapTiler map,
      click-to-place marker), PostTripScreen wires it to an insert into `trips`.
      Verified end-to-end against the real DB, both locally and on the live Vercel site.
- [x] Rider can search/request a ride within their time window. RequestRideScreen
      (mirrors PostTripScreen) inserts into `ride_requests` with an earliest/latest
      departure window. App.tsx has a simple tab switcher between the two flows.
      Verified end-to-end against the real DB.
- [x] Basic matching: server-side query returns candidate trips within radius + time window.
      `find_candidate_trips(request_id)` Postgres function (ST_DWithin, 5mi radius on both
      origin and destination + time-window overlap), called via RPC right after a ride
      request is submitted; RequestRideScreen shows the resulting candidates. Verified
      end-to-end against the real DB.
- [x] Match confirmation flow, reveal contact info once both sides confirm. Rider requests
      a specific candidate trip (inserts a pending `matches` row); driver confirms/declines
      from the new "My matches" tab. `get_match_contact()` reveals the other party's email
      only once confirmed. Verified end-to-end against the real DB.
- [ ] Suggested cost-split calculation displayed

**Phase 2 — Polish for demo**
- Trip history / "my rides" view
- Basic email notifications ("you have a match")
- Simple responsive styling, works well on phone browsers
- Geofence validation (reject trips outside 50mi radius) with a clear error message

**Phase 3 — Only if the company adopts it**
- Migrate to company cloud infra
- Real payments (Stripe Connect) if they want in-app settlement
- Native app, push notifications
- SSO integration if IT wants it instead of custom OTP
- Admin dashboard, ratings, recurring trips

## 7. Open flags — revisit before any real internal launch

Not blockers for building the MVP, but worth knowing before demoing to leadership or
letting real coworkers use this beyond a small pilot:

- **HR/Legal should review before wider rollout.** Facilitating cost-sharing between
  employees and coordinating their commutes can touch liability and tax questions
  (e.g., IRS treatment of mileage reimbursement) that are worth a quick legal check,
  even for a well-intentioned internal tool.
- **Data privacy:** you'll be storing employee home/work commute patterns. Treat this
  as sensitive data even at MVP — don't over-collect, and be ready to explain your
  data handling if IT asks.
- These don't need to be solved to build and demo the MVP to a small pilot group —
  just don't scale past that without a sign-off.

## 8. How we'll work together

- One Claude Code session = one milestone from the phase list above, not "build the whole thing"
- Keep this file updated as decisions change — paste the relevant section back to me
  at the start of a session instead of re-explaining from scratch
- I'll flag when something on the "out of scope" list is being pulled forward
  unintentionally — feel free to override, just flag it explicitly when you do