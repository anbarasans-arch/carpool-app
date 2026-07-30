-- Fills in matches.suggested_cost_split automatically on insert: straight-
-- line trip distance (a simple stand-in for real driving distance - see
-- FOLLOWUPS.md re: swapping in a routing API like OpenRouteService later)
-- times a flat per-mile rate, split between driver and rider (2 people).
--
-- This is a suggestion shown in the app only - no in-app payment
-- processing, per PROJECT.md's hard requirements.
create function public.set_suggested_cost_split()
returns trigger
language plpgsql
as $$
declare
  trip_distance_meters double precision;
  rate_per_mile constant numeric := 0.67;
  meters_per_mile constant numeric := 1609.344;
begin
  select ST_Distance(origin_point, destination_point)
  into trip_distance_meters
  from public.trips
  where id = new.trip_id;

  new.suggested_cost_split := round(
    (trip_distance_meters / meters_per_mile * rate_per_mile / 2)::numeric,
    2
  );
  return new;
end;
$$;

create trigger set_suggested_cost_split_trigger
  before insert on public.matches
  for each row execute function public.set_suggested_cost_split();
