-- Found while building per-city dashboard metrics: 23 real users signed up
-- between 2026-08-13 and 2026-08-18 (after the region feature launched)
-- without ever getting home_region_id set - the fire-and-forget
-- set_home_region RPC call in App.tsx isn't reliably completing for new
-- signups. Worth a separate investigation, but not blocking here: every
-- one of these users necessarily signed up when DFW was the only region
-- that existed, so backfilling them to 'dfw' is unambiguous, not a guess -
-- same rationale as the original backfill in 20260812010000.
update public.users set home_region_id = 'dfw' where home_region_id is null;
