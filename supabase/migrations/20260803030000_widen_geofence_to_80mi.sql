-- Widen the trip geofence from 50 to 80 miles from the office (see
-- migration 20260731021429). PROJECT.md's hard requirement text updated to
-- match. Still a hard boundary, just a bigger one - not removed.
create or replace function public.enforce_trip_geofence()
returns trigger
language plpgsql
as $$
declare
  office_point constant geography := 'SRID=4326;POINT(-97.1906054 32.9817475)'::geography;
  radius_meters constant double precision := 80 * 1609.344;
begin
  if not ST_DWithin(new.origin_point, office_point, radius_meters) then
    raise exception 'Trip origin must be within 80 miles of the office.';
  end if;
  if not ST_DWithin(new.destination_point, office_point, radius_meters) then
    raise exception 'Trip destination must be within 80 miles of the office.';
  end if;
  return new;
end;
$$;
