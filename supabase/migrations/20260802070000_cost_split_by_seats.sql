-- Previously suggested_cost_split always divided the trip cost by 2
-- (driver + 1 rider), regardless of how many seats the trip actually
-- offers. Change it to divide by the total number of people the trip can
-- hold - the driver plus all offered seats - so a bigger trip means a
-- cheaper suggested share per rider, which is the whole point of
-- carpooling with more people. Every match on the same trip gets the same
-- per-rider share, computed from the trip's seats_available at match-
-- creation time (seat inventory isn't decremented yet - see FOLLOWUPS.md -
-- so this stays the seat count the driver originally posted).
create or replace function public.set_suggested_cost_split()
returns trigger
language plpgsql
as $$
declare
  trip_distance_meters double precision;
  trip_seats_available int;
  rate_per_mile constant numeric := 0.67;
  meters_per_mile constant numeric := 1609.344;
begin
  select ST_Distance(origin_point, destination_point), seats_available
  into trip_distance_meters, trip_seats_available
  from public.trips
  where id = new.trip_id;

  new.suggested_cost_split := round(
    (trip_distance_meters / meters_per_mile * rate_per_mile / (1 + trip_seats_available))::numeric,
    2
  );
  return new;
end;
$$;
