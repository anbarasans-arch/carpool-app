-- "Option 2" proactive matching notifications (see FOLLOWUPS.md): notify
-- someone by email when a NEW row appears that matches a standing trip or
-- ride request they already posted - not just when they take an action.
-- Complements find_candidate_trips / find_candidate_riders (which only
-- surface candidates that already existed at the moment you post), closing
-- the timing gap where a match is missed because the two sides posted at
-- different times and neither went looking again.
--
-- This can't use the client-invoked Edge Function pattern (notify-match) -
-- the person to notify isn't the one performing the action (a rider
-- inserting a request doesn't know or care who it should email), so the
-- reaction has to live in Postgres itself, fired directly off the insert.
--
-- Deliberately does NOT create a matches row - this is a heads-up ("go
-- take a look"), not a proposal. Creating a pending match for every
-- geographic candidate would spam the matches table and misrepresent
-- consent. The email links to My Rides, where a "View candidates" action
-- (added to MyRidesScreen alongside this migration) lets the recipient
-- actually see the match and decide whether to invite/request it.

-- Shared by both trigger functions below. security definer (as are both
-- triggers) since regular users have no grants on the vault/net schemas
-- and can't read another user's email via public.users' own RLS.
create function public.send_transactional_email(
  recipient_email text,
  subject text,
  html_body text
)
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  api_key text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';

  if api_key is null then
    raise warning 'resend_api_key not found in vault - skipping email to %', recipient_email;
    return;
  end if;

  -- Fire-and-forget: net.http_post queues the request and returns
  -- immediately (a background worker sends it), so this never blocks or
  -- fails the insert that triggered it. Matches the "best-effort
  -- notification" pattern already used for the client-invoked emails.
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Let''s Carpool <noreply@mail.lets-carpool.com>',
      'to', jsonb_build_array(recipient_email),
      'subject', subject,
      'html', html_body
    )
  );
end;
$$;

-- A new ride request just appeared - email the driver of any existing
-- active trip with an open seat that matches it (same radius/time-window
-- logic as find_candidate_trips).
create function public.notify_drivers_of_new_rider()
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

create trigger notify_drivers_of_new_rider_trigger
  after insert on public.ride_requests
  for each row execute function public.notify_drivers_of_new_rider();

-- A new trip just appeared - email the rider of any existing open ride
-- request that matches it (same radius/time-window logic as
-- find_candidate_riders).
create function public.notify_riders_of_new_trip()
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

create trigger notify_riders_of_new_trip_trigger
  after insert on public.trips
  for each row execute function public.notify_riders_of_new_trip();
