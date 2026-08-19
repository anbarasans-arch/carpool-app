# Carpool Pulse dashboard

`template.html` is the usage dashboard published at:
https://claude.ai/code/artifact/aa384c84-b489-436b-90f8-1bf3fd27d566

A daily scheduled routine ("Carpool Pulse daily refresh", claude.ai/code/routines)
regenerates it automatically (~6:07pm Central) by calling the `dashboard-metrics`
Edge Function, splicing the result into `template.html`'s `REGIONS`, `DAILY`,
`MONTHLY`, `DOMAINS`, and `KPI` JS consts (leave everything else - styles,
layout, embedded font, chart-drawing JS, the empty-state panel - untouched),
updating the "Snapshot as of" date, and republishing to the same URL above
via the Artifact tool. See the routine's own prompt (claude.ai/code/routines)
for the exact splice script it runs - keep this doc and that prompt in sync
if the shape ever changes again.

## Where the numbers actually come from

`supabase/migrations/20260818020000_dashboard_metrics_by_region.sql` defines
`get_dashboard_metrics()`, a single Postgres function that returns everything
the dashboard needs as one jsonb payload. It's locked to `service_role` only
(same defense-in-depth pattern as the rest of this project's sensitive
functions); the `dashboard-metrics` Edge Function fronts it behind a shared
secret header (`x-dashboard-secret`, set via `supabase secrets set
DASHBOARD_METRICS_SECRET=...`) so the daily routine can call it over plain
HTTPS without needing raw database credentials.

All queries exclude the builder's own test accounts (`email like
'anbarasan.santhalingam%'`) - keep that filter in place in any future
edit to the function.

## Multi-city: every row is tagged by region

As of 2026-08-19 the app supports multiple cities (`config/regions.ts` /
the `regions` table - see that file's comment for how to add one). The
dashboard reflects this with a **"Viewing" dropdown**: "All cities" (summed
across regions, computed client-side in `template.html`'s JS) plus one
option per active region. Adding a new city needs zero changes to this
dashboard - `get_dashboard_metrics()` reads the active `regions` rows
dynamically, and the dropdown/render logic is driven entirely by whatever
`REGIONS` contains.

Attribution:
- **Signups** - by the user's `home_region_id` (`public.users`), i.e. the
  city they picked, not where any individual trip/request happened to be
  posted.
- **Trips / ride requests** - by their own `region_id` column.
- **Matches** - via the match's trip's `region_id` (a match's trip and ride
  request always share a region, enforced by the region-scoped matching
  functions, so either side would give the same answer).

### Response shape (`get_dashboard_metrics()` / the Edge Function's JSON)

```
{
  "regions":  [{ "id": "dfw", "name": "Dallas–Fort Worth" }, ...],
  "daily":    [{ "region_id": "dfw", "date": "08-19", "signups": 0, "trips": 0, "requests": 0, "matches": 0 }, ...],  // 30 days x N regions
  "monthly":  [{ "region_id": "dfw", "month": "Aug 2026", "signups": 0, "trips": 0, "requests": 0, "matches": 0 }, ...],
  "domains":  [{ "region_id": "dfw", "domain": "gmail.com", "count": 0 }, ...],
  "kpi":      [{ "region_id": "dfw", "real_signups": 0, "signups_7d": 0, "total_trips": 0, "trips_active_upcoming": 0,
                 "total_requests": 0, "requests_active_upcoming": 0, "matches_pending": 0, "matches_confirmed": 0,
                 "matches_declined": 0, "activated": 0 }, ...],  // one object per active region, NOT pre-summed
  "generated_at": "..."
}
```

`template.html`'s JS renames `date`->`d` and `month`->`m` when it embeds
these as `DAILY`/`MONTHLY` (matching the compact keys the chart code
expects) but otherwise passes the shape straight through.

## A bug worth remembering (fixed 2026-08-19)

Splicing this data on Windows via a plain `open('metrics.json')` (no
`encoding='utf-8'`) silently corrupts non-ASCII characters - "Dallas–Fort
Worth" became mojibake ("Dallasâ€“Fort Worth") because the default text
encoding wasn't UTF-8. Always pass `encoding='utf-8'` explicitly on every
file open in any splice script that touches this dashboard, including
reading `template.html` itself.

## Notes for whoever (or whatever agent) regenerates this

- Trend annotation on the "Ride requests" sparkline (`annotateIndex`/`annotateLabel`
  in `renderTrends()`) points at 08-13, the day the bulk multi-date picker
  feature caused a real usage spike in DFW. It's deliberately gated to only
  show for the `dfw` region and "All cities" (`renderTrends`'s
  `showAnnotation` check) - not on every region's zero-value row for that
  date. Leave it pinned there unless a new event is more notable.
- If a metric's peak value changes significantly, the sparkline function
  auto-scales, so no manual adjustment needed.
- A region with zero real signups renders an empty-state panel instead of
  the full charts (`render()`'s early-return in `template.html`) - this is
  intentional for newly-added cities, not a bug.
- `real_signups` per region should stay accurate as the pilot grows - don't
  reset or filter differently between runs, or day-over-day comparisons
  break. If a user's `home_region_id` is ever null (shouldn't happen -
  `set_home_region` sets it at sign-in - but see the 2026-08-18 backfill
  migration for a case where 23 users slipped through), they won't be
  attributed to any region and will silently undercount every per-city
  view; worth periodically checking
  `select count(*) from public.users where home_region_id is null`.
