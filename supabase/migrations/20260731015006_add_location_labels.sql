-- Store the human-readable address alongside each geography point. We had
-- this text from LocationPicker's geocoding result at creation time but
-- were only inserting the coordinates - needed now for the "My rides"
-- history view (and any other place that lists trips/requests) to show
-- something better than raw lat/lng. Safe to add NOT NULL directly: both
-- tables are empty (no real users yet).
alter table public.trips
  add column origin_label text not null default '',
  add column destination_label text not null default '';

alter table public.trips
  alter column origin_label drop default,
  alter column destination_label drop default;

alter table public.ride_requests
  add column origin_label text not null default '',
  add column destination_label text not null default '';

alter table public.ride_requests
  alter column origin_label drop default,
  alter column destination_label drop default;
