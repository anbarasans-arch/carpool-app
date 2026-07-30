-- Returns candidate trips for a given ride request: active trips with an
-- open seat, departing inside the rider's desired time window, whose origin
-- and destination are both within MATCH_RADIUS_METERS of the request's.
--
-- MATCH_RADIUS_METERS (5 miles) is a "how close counts as a match" proximity
-- for candidate matching - unrelated to the 50mi office geofence (Phase 2,
-- see FOLLOWUPS.md), which instead constrains where trips/requests can be
-- created at all.
--
-- No security definer / explicit rider_id check needed: this runs under the
-- caller's own RLS, so the `ride_requests` join already returns nothing for
-- a request that isn't the caller's own (per the "Riders can view own ride
-- requests" policy), and `trips` is readable by any authenticated user.
create function public.find_candidate_trips(request_id uuid)
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
    and t.departure_time between rr.desired_time_start and rr.desired_time_end
    and ST_DWithin(t.origin_point, rr.origin_point, 8046.72)
    and ST_DWithin(t.destination_point, rr.destination_point, 8046.72)
  where rr.id = request_id
  order by ST_Distance(t.origin_point, rr.origin_point) + ST_Distance(t.destination_point, rr.destination_point);
$$;

grant execute on function public.find_candidate_trips(uuid) to authenticated;
