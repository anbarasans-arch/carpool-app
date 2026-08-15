-- Bulk multi-date posting (PostTripScreen/RequestRideScreen, 2026-08-12) only
-- ever auto-showed "matching trips/riders nearby" when exactly one date was
-- selected - a bulk submission's rows never got that signal at all, even
-- when real candidates existed. Confirmed live: two real ride requests
-- created via the bulk picker had a genuine matching trip and nobody saw
-- it. These two functions let the client ask "how many of the rows I just
-- inserted already have a candidate?" in one round trip, so a bulk
-- submission can show a summary banner instead of nothing.

-- Rider side: same conditions as find_candidate_trips (20260730123828,
-- region-scoped by 20260812020000), just counting distinct matching
-- ride_requests instead of returning candidate trips for one. No
-- security definer needed - relies on "Riders can view own ride requests"
-- RLS the same way find_candidate_trips does.
create function public.count_requests_with_candidates(request_ids uuid[])
returns int
language sql
stable
as $$
  select count(distinct rr.id)::int
  from public.ride_requests rr
  where rr.id = any(request_ids)
    and exists (
      select 1
      from public.trips t
      where t.status = 'active'
        and t.seats_available > 0
        and t.departure_time > now()
        and t.region_id = rr.region_id
        and t.departure_time between rr.desired_time_start and rr.desired_time_end
        and ST_DWithin(t.origin_point, rr.origin_point, 8046.72)
        and ST_DWithin(t.destination_point, rr.destination_point, 8046.72)
    );
$$;

grant execute on function public.count_requests_with_candidates(uuid[]) to authenticated;

-- Driver side: same conditions as find_candidate_riders (20260803010000,
-- region-scoped by 20260812020000). Needs security definer + an explicit
-- ownership check for the same reason find_candidate_riders does - the
-- caller isn't the rider on the ride_requests being searched.
create function public.count_trips_with_candidates(trip_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result int;
begin
  select count(distinct t.id) into result
  from public.trips t
  where t.id = any(trip_ids)
    and t.driver_id = auth.uid()
    and exists (
      select 1
      from public.ride_requests rr
      where rr.status = 'open'
        and rr.desired_time_end > now()
        and rr.region_id = t.region_id
        and t.departure_time between rr.desired_time_start and rr.desired_time_end
        and ST_DWithin(t.origin_point, rr.origin_point, 8046.72)
        and ST_DWithin(t.destination_point, rr.destination_point, 8046.72)
        and not exists (
          select 1 from public.matches m
          where m.trip_id = t.id and m.ride_request_id = rr.id
        )
    );
  return coalesce(result, 0);
end;
$$;

grant execute on function public.count_trips_with_candidates(uuid[]) to authenticated;
