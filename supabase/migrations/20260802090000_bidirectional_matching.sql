-- Lets a driver proactively see nearby open ride requests after posting a
-- trip and invite one, mirroring the existing rider-initiated flow (rider
-- searches trips -> requests one). Needs three things:
--
-- 1. matches.proposed_by - tracks who initiated a match (driver or rider),
--    so the UI/notifications know who's waiting on whom. Set server-side by
--    a trigger (never trusts a client-supplied value) and made immutable
--    alongside the other identity columns already protected below.
-- 2. A driver-side INSERT policy on matches, mirroring the existing
--    rider-side one.
-- 3. find_candidate_riders(trip_id) - the reverse of find_candidate_trips.
--    Needs security definer + an explicit ownership check, unlike its
--    sibling: find_candidate_trips relies on ride_requests' own "Riders can
--    view own ride requests" RLS to scope results, but here the caller
--    (the driver) is NOT the rider on the ride_requests being searched, so
--    plain invoker-rights SQL would just return nothing.

-- 1a. Add the column. Nullable first since 2 real rows already exist from
-- earlier phases - backfill them (every existing match was rider-proposed,
-- since the rider-side insert policy was the only way to create one until
-- now), then lock it down.
alter table public.matches add column proposed_by uuid references public.users(id);

update public.matches m
set proposed_by = rr.rider_id
from public.ride_requests rr
where m.ride_request_id = rr.id and m.proposed_by is null;

alter table public.matches alter column proposed_by set not null;

-- 1b. Server-derived on insert - never trust a client-supplied value for
-- identity fields.
create function public.set_match_proposed_by()
returns trigger
language plpgsql
as $$
begin
  new.proposed_by := auth.uid();
  return new;
end;
$$;

create trigger set_match_proposed_by_trigger
  before insert on public.matches
  for each row execute function public.set_match_proposed_by();

-- 1c. Extend the existing tamper-prevention trigger (migration
-- 20260731023942) to also protect proposed_by after creation.
create or replace function public.prevent_match_identity_tampering()
returns trigger
language plpgsql
as $$
begin
  if new.trip_id <> old.trip_id or new.ride_request_id <> old.ride_request_id
    or new.suggested_cost_split is distinct from old.suggested_cost_split
    or new.proposed_by is distinct from old.proposed_by then
    raise exception 'trip_id, ride_request_id, suggested_cost_split, and proposed_by cannot be changed after a match is created.';
  end if;
  return new;
end;
$$;

-- 2. Mirrors "Riders can propose matches for own ride requests" - same
-- shape, same status = 'pending' restriction (see migration 20260731023942
-- for why that matters: without it a caller could self-confirm on insert).
create policy "Drivers can propose matches for own trips" on public.matches
  for insert with check (
    status = 'pending'
    and exists (select 1 from public.trips where id = trip_id and driver_id = auth.uid())
  );

-- 3. Reverse of find_candidate_trips (migration 20260730123828): same
-- radius/time-window logic, opposite direction. Excludes ride requests that
-- already have a match against this trip (pending, confirmed, or declined)
-- so a driver doesn't see - or re-invite - someone already in the pipeline.
create function public.find_candidate_riders(trip_id uuid)
returns table (
  ride_request_id uuid,
  desired_time_start timestamptz,
  desired_time_end timestamptz,
  origin_distance_meters double precision,
  destination_distance_meters double precision
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = find_candidate_riders.trip_id and t.driver_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    rr.id,
    rr.desired_time_start,
    rr.desired_time_end,
    ST_Distance(t.origin_point, rr.origin_point),
    ST_Distance(t.destination_point, rr.destination_point)
  from public.trips t
  join public.ride_requests rr
    on rr.status = 'open'
    and t.departure_time between rr.desired_time_start and rr.desired_time_end
    and ST_DWithin(t.origin_point, rr.origin_point, 8046.72)
    and ST_DWithin(t.destination_point, rr.destination_point, 8046.72)
    and not exists (
      select 1 from public.matches m
      where m.trip_id = t.id and m.ride_request_id = rr.id
    )
  where t.id = find_candidate_riders.trip_id
  order by ST_Distance(t.origin_point, rr.origin_point) + ST_Distance(t.destination_point, rr.destination_point);
end;
$$;

grant execute on function public.find_candidate_riders(uuid) to authenticated;
