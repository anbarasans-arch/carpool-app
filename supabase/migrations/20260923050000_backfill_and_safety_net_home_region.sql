-- 73 real users have home_region_id = null as of today, dating back to
-- 2026-08-19 (right after multi-city launch) - the same "fire-and-forget
-- set_home_region RPC isn't reliably completing" problem the 2026-08-18
-- backfill (20260818030000) already found and only partially fixed, by
-- backfilling the 23 cases known at the time to 'dfw' (safe then, since
-- DFW was still the only region). It recurred at ~2x the rate since,
-- across all three regions, including several users active as recently
-- as today - so the underlying client bug was never actually fixed, just
-- patched once. This migration:
--   1. Backfills every currently-null user whose own trips/ride_requests
--      unambiguously show one region (34 of the 73 - see query below).
--   2. Adds a trigger-based safety net so this stops silently recurring:
--      any time a user posts a trip or ride request, if their profile
--      still has no home_region_id, set it from that post's region_id.
--      Posting activity is a strictly stronger signal than the sign-in-time
--      RPC ever was (it can't race a profile-row-creation trigger, and it
--      fires every time a user acts, not just once at sign-in), so this
--      closes the gap regardless of whatever exact client-side race or
--      bug caused the original miss.
-- The remaining ~39 null-home-region users have never posted a trip or
-- ride request, so there's no signal to infer a region from - they stay
-- null (same as any signed-up-but-inactive user) until they post or the
-- client-side call succeeds.

update public.users u
set home_region_id = inferred.region_id
from (
  select user_id, region_id
  from (
    select driver_id as user_id, region_id from public.trips
    union all
    select rider_id as user_id, region_id from public.ride_requests
  ) activity
  group by user_id, region_id
  having count(*) = (
    select count(*) from (
      select driver_id as user_id, region_id from public.trips
      union all
      select rider_id as user_id, region_id from public.ride_requests
    ) all_activity
    where all_activity.user_id = activity.user_id
  )
) inferred
where u.id = inferred.user_id and u.home_region_id is null;

-- Two near-identical functions rather than one polymorphic one: `new` is a
-- generic RECORD in a trigger function shared across tables with different
-- columns, and referencing a column the current table doesn't have (even in
-- a CASE branch that shouldn't execute) throws at runtime - simplest to
-- just not share the function.
create function public.backfill_home_region_from_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set home_region_id = new.region_id
  where id = new.driver_id and home_region_id is null;
  return new;
end;
$$;

create function public.backfill_home_region_from_ride_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set home_region_id = new.region_id
  where id = new.rider_id and home_region_id is null;
  return new;
end;
$$;

create trigger backfill_home_region_from_trip
  after insert on public.trips
  for each row execute function public.backfill_home_region_from_trip();

create trigger backfill_home_region_from_ride_request
  after insert on public.ride_requests
  for each row execute function public.backfill_home_region_from_ride_request();
