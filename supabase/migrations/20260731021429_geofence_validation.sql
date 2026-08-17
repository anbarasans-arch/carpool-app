-- Enforces PROJECT.md's hard requirement: "all trips must have origin and
-- destination within 50 miles of the Dallas office coordinates. Reject
-- trip creation outside this radius." Office confirmed 2026-07-31: the
-- company's Westlake office, 1 Destiny Way, Westlake, TX 76262
-- (32.9817475, -97.1906054) - see FOLLOWUPS.md.
--
-- A trigger rather than a CHECK constraint: ST_DWithin is STABLE, not
-- IMMUTABLE, and Postgres requires CHECK constraint expressions to be
-- immutable.
--
-- Scoped to `trips` only, not `ride_requests` - PROJECT.md's hard
-- requirement specifically names trips, and an out-of-range ride request
-- is already harmless (it just won't find any candidate trips via
-- find_candidate_trips' proximity filter).
create function public.enforce_trip_geofence()
returns trigger
language plpgsql
as $$
declare
  office_point constant geography := 'SRID=4326;POINT(-97.1906054 32.9817475)'::geography;
  radius_meters constant double precision := 50 * 1609.344;
begin
  if not ST_DWithin(new.origin_point, office_point, radius_meters) then
    raise exception 'Trip origin must be within 50 miles of the office.';
  end if;
  if not ST_DWithin(new.destination_point, office_point, radius_meters) then
    raise exception 'Trip destination must be within 50 miles of the office.';
  end if;
  return new;
end;
$$;

create trigger enforce_trip_geofence_trigger
  before insert or update on public.trips
  for each row execute function public.enforce_trip_geofence();
