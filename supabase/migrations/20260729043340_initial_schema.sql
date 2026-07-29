-- Enable PostGIS for geography columns and spatial queries (ST_DWithin etc.)
create extension if not exists postgis;

-- Profile row per authenticated user, keyed to Supabase Auth's auth.users.
-- Email domain (@fmr.com) is enforced here as defense in depth; the primary
-- gate is the OTP-request Edge Function rejecting other domains before a
-- code is ever sent.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email like '%@fmr.com'),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- A driver posting "I'm driving this route".
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.users (id) on delete cascade,
  origin_point geography(point, 4326) not null,
  destination_point geography(point, 4326) not null,
  departure_time timestamptz not null,
  seats_available int not null check (seats_available >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index trips_origin_point_idx on public.trips using gist (origin_point);
create index trips_destination_point_idx on public.trips using gist (destination_point);
create index trips_driver_id_idx on public.trips (driver_id);

-- A rider looking for a match within a time window.
create table public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.users (id) on delete cascade,
  origin_point geography(point, 4326) not null,
  destination_point geography(point, 4326) not null,
  desired_time_start timestamptz not null,
  desired_time_end timestamptz not null check (desired_time_end > desired_time_start),
  status text not null default 'open' check (status in ('open', 'matched', 'cancelled', 'expired')),
  created_at timestamptz not null default now()
);

create index ride_requests_origin_point_idx on public.ride_requests using gist (origin_point);
create index ride_requests_destination_point_idx on public.ride_requests using gist (destination_point);
create index ride_requests_rider_id_idx on public.ride_requests (rider_id);

-- A proposed pairing between a trip and a ride request.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  ride_request_id uuid not null references public.ride_requests (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  suggested_cost_split numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (trip_id, ride_request_id)
);

create index matches_trip_id_idx on public.matches (trip_id);
create index matches_ride_request_id_idx on public.matches (ride_request_id);

-- Row Level Security: the app talks to Postgres via the publishable
-- (anon-equivalent) key from the client, so every table needs explicit
-- policies rather than relying on default-deny alone.
alter table public.users enable row level security;
alter table public.trips enable row level security;
alter table public.ride_requests enable row level security;
alter table public.matches enable row level security;

create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- Trips are browsable by any signed-in user (needed to search for rides);
-- only the owning driver can create/modify/remove their own trip.
create policy "Authenticated users can view trips" on public.trips
  for select to authenticated using (true);

create policy "Drivers can insert own trips" on public.trips
  for insert with check (auth.uid() = driver_id);

create policy "Drivers can update own trips" on public.trips
  for update using (auth.uid() = driver_id);

create policy "Drivers can delete own trips" on public.trips
  for delete using (auth.uid() = driver_id);

-- Ride requests are only visible/editable by the rider who created them.
-- Server-side matching (Edge Function, service role) bypasses RLS.
create policy "Riders can view own ride requests" on public.ride_requests
  for select using (auth.uid() = rider_id);

create policy "Riders can insert own ride requests" on public.ride_requests
  for insert with check (auth.uid() = rider_id);

create policy "Riders can update own ride requests" on public.ride_requests
  for update using (auth.uid() = rider_id);

create policy "Riders can delete own ride requests" on public.ride_requests
  for delete using (auth.uid() = rider_id);

-- Matches are visible/confirmable only by the two involved parties: the
-- trip's driver and the ride request's rider. Matches are created
-- server-side (service role), so there is no client insert policy.
create policy "Participants can view own matches" on public.matches
  for select using (
    auth.uid() in (
      select driver_id from public.trips where id = trip_id
      union
      select rider_id from public.ride_requests where id = ride_request_id
    )
  );

create policy "Participants can update own matches" on public.matches
  for update using (
    auth.uid() in (
      select driver_id from public.trips where id = trip_id
      union
      select rider_id from public.ride_requests where id = ride_request_id
    )
  );
