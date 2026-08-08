-- Bug: expired trips/ride requests (time window already passed) kept
-- showing up as viable candidates and triggering notifications, since
-- every "is this open" check only looked at the status column
-- ('active'/'open'), never whether the window had actually already
-- passed. status only changes on an explicit action (cancel, get
-- matched) - nothing ever marked a stale row as no-longer-current, and
-- there's no scheduled job in this project to do that proactively.
--
-- Fix: add a live time check (`> now()`) everywhere a trip/request's
-- current availability matters, instead of introducing a cron job to
-- rewrite status columns. This is always accurate (no lag) and doesn't
-- need pg_cron. The stored status value is unchanged by this migration -
-- MyRidesScreen derives "expired" for display the same way, from the
-- timestamp, not from status.
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
