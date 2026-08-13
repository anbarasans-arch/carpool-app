-- Multi-city support: introduces `regions` as the server-side source of
-- truth for which cities this app operates in (office location + geofence
-- radius per city), replacing the single hardcoded Dallas/Westlake point
-- used by the geofence trigger and matching queries. The human-editable
-- config lives in config/regions.ts (see comment there) - this table is
-- what's actually enforced, since the geofence check has to hold
-- server-side regardless of what the client sends.
create table public.regions (
  id text primary key,
  name text not null,
  office_point geography(point, 4326) not null,
  radius_miles numeric not null check (radius_miles > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Matches config/regions.ts's initial 'dfw' entry - same coordinates and
-- radius already in use by the (now-superseded) hardcoded geofence trigger.
insert into public.regions (id, name, office_point, radius_miles) values (
  'dfw',
  'Dallas–Fort Worth',
  'SRID=4326;POINT(-97.1906054 32.9817475)',
  80
);

alter table public.regions enable row level security;

-- Not sensitive - just the list of supported cities, needed client-side for
-- the city picker.
create policy "Authenticated users can view regions" on public.regions
  for select to authenticated using (true);

-- Backfill existing rows to the only region that has ever existed, then
-- require it going forward (every trip/request must be scoped to a city so
-- the geofence and matching queries know which office to check against).
alter table public.trips add column region_id text references public.regions(id);
update public.trips set region_id = 'dfw' where region_id is null;
alter table public.trips alter column region_id set not null;
create index trips_region_id_idx on public.trips (region_id);

alter table public.ride_requests add column region_id text references public.regions(id);
update public.ride_requests set region_id = 'dfw' where region_id is null;
alter table public.ride_requests alter column region_id set not null;
create index ride_requests_region_id_idx on public.ride_requests (region_id);

-- A user's default city. Nullable (new sign-ins pick one before their first
-- post; existing users are backfilled to the only region that's existed so
-- far). Not required at insert time the way trips/ride_requests are - it's
-- just where the client defaults the picker to.
alter table public.users add column home_region_id text references public.regions(id);
update public.users set home_region_id = 'dfw' where home_region_id is null;
