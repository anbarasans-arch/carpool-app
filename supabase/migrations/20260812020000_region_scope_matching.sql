-- Makes the geofence check and every matching/notification query
-- region-aware, now that trips/ride_requests carry a region_id (migration
-- 20260812010000). Two things this fixes:
--
-- 1. enforce_trip_geofence() was checking distance from a single hardcoded
--    Dallas point - wrong for a trip posted in any other city. Now looks up
--    the office point + radius from `regions` by the trip's own region_id.
-- 2. Proximity alone (ST_DWithin) isn't enough to keep cities separate once
--    there's more than one - two nearby-but-different regions could
--    otherwise cross-match on raw distance. Every matching/notification
--    query now also requires region_id to match, so a trip only ever
--    matches against ride requests posted in the same city.
create or replace function public.enforce_trip_geofence()
returns trigger
language plpgsql
as $$
declare
  region_office geography;
  region_radius_miles numeric;
begin
  select office_point, radius_miles into region_office, region_radius_miles
  from public.regions
  where id = new.region_id;

  if region_office is null then
    raise exception 'Unknown region.';
  end if;

  if not ST_DWithin(new.origin_point, region_office, region_radius_miles * 1609.344) then
    raise exception 'Trip origin must be within % miles of the office.', region_radius_miles;
  end if;
  if not ST_DWithin(new.destination_point, region_office, region_radius_miles * 1609.344) then
    raise exception 'Trip destination must be within % miles of the office.', region_radius_miles;
  end if;
  return new;
end;
$$;

create or replace function public.find_candidate_trips(request_id uuid)
returns table (
  trip_id uuid,
  departure_time timestamptz,
  seats_available int,
  origin_distance_meters double precision,
  destination_distance_meters double precision
)
language sql
stable
as $$
  select
    t.id,
    t.departure_time,
    t.seats_available,
    ST_Distance(t.origin_point, rr.origin_point),
    ST_Distance(t.destination_point, rr.destination_point)
  from public.ride_requests rr
  join public.trips t
    on t.status = 'active'
    and t.seats_available > 0
    and t.departure_time > now()
    and t.region_id = rr.region_id
    and t.departure_time between rr.desired_time_start and rr.desired_time_end
    and ST_DWithin(t.origin_point, rr.origin_point, 8046.72)
    and ST_DWithin(t.destination_point, rr.destination_point, 8046.72)
  where rr.id = request_id
  order by ST_Distance(t.origin_point, rr.origin_point) + ST_Distance(t.destination_point, rr.destination_point);
$$;

create or replace function public.find_candidate_riders(trip_id uuid)
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
    and rr.desired_time_end > now()
    and rr.region_id = t.region_id
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

create or replace function public.notify_drivers_of_new_rider()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  driver_email text;
begin
  for candidate in
    select t.driver_id
    from public.trips t
    where t.status = 'active'
      and t.seats_available > 0
      and t.departure_time > now()
      and t.region_id = new.region_id
      and t.departure_time between new.desired_time_start and new.desired_time_end
      and ST_DWithin(t.origin_point, new.origin_point, 8046.72)
      and ST_DWithin(t.destination_point, new.destination_point, 8046.72)
  loop
    select email into driver_email from public.users where id = candidate.driver_id;
    if driver_email is not null then
      perform public.send_transactional_email(
        driver_email,
        'A rider is looking for a ride matching your trip',
        '<p>A new ride request matches a trip you posted.</p>'
        || '<p><a href="https://lets-carpool.com/?tab=rides">Open My rides</a> to view and invite them.</p>'
      );
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.notify_riders_of_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  rider_email text;
begin
  for candidate in
    select rr.rider_id
    from public.ride_requests rr
    where rr.status = 'open'
      and rr.desired_time_end > now()
      and rr.region_id = new.region_id
      and new.departure_time between rr.desired_time_start and rr.desired_time_end
      and ST_DWithin(new.origin_point, rr.origin_point, 8046.72)
      and ST_DWithin(new.destination_point, rr.destination_point, 8046.72)
  loop
    select email into rider_email from public.users where id = candidate.rider_id;
    if rider_email is not null then
      perform public.send_transactional_email(
        rider_email,
        'A new trip matches your ride request',
        '<p>A new trip matches a ride request you posted.</p>'
        || '<p><a href="https://lets-carpool.com/?tab=rides">Open My rides</a> to view and request it.</p>'
      );
    end if;
  end loop;
  return new;
end;
$$;
