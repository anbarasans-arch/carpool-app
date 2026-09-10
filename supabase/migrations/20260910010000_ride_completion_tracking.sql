-- Tracks whether a confirmed match's ride actually happened. Nothing in
-- the app previously recorded this - trips.status allowed a 'completed'
-- value in the original schema but nothing ever set it, so every trip and
-- ride_request sits at 'active'/'open' forever regardless of whether the
-- ride occurred. This is scoped to matches (not trips) since one trip can
-- have several confirmed riders with different real outcomes.
--
-- Two independent nullable booleans (one per side) rather than a single
-- shared flag, so a no-show is visible as a disagreement (e.g. driver says
-- yes, rider says no) instead of one person silently answering for both.
alter table public.matches add column driver_ride_confirmed boolean;
alter table public.matches add column rider_ride_confirmed boolean;

-- Records the caller's own side of "did this ride happen?" - not a plain
-- client .update() because the existing "Participants can respond to
-- matches they did not propose" policy only ever allows the non-proposer
-- to update a match (it was written for the confirm/decline step), and
-- because this needs real validation (only after the match is confirmed
-- and only after the ride's departure time has actually passed) beyond
-- what a table-level RLS policy can express cleanly.
create function public.confirm_ride_completion(match_id uuid, happened boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_driver_id uuid;
  match_rider_id uuid;
  match_status text;
  match_departure timestamptz;
begin
  select t.driver_id, rr.rider_id, m.status, t.departure_time
    into match_driver_id, match_rider_id, match_status, match_departure
  from public.matches m
  join public.trips t on t.id = m.trip_id
  join public.ride_requests rr on rr.id = m.ride_request_id
  where m.id = confirm_ride_completion.match_id;

  if match_driver_id is null then
    raise exception 'Match not found.';
  end if;
  if auth.uid() not in (match_driver_id, match_rider_id) then
    raise exception 'Not a participant in this match.';
  end if;
  if match_status <> 'confirmed' then
    raise exception 'Only confirmed matches can be marked as happened or not.';
  end if;
  if match_departure > now() then
    raise exception 'Cannot confirm a ride before its departure time.';
  end if;

  if auth.uid() = match_driver_id then
    update public.matches set driver_ride_confirmed = happened where id = confirm_ride_completion.match_id;
  else
    update public.matches set rider_ride_confirmed = happened where id = confirm_ride_completion.match_id;
  end if;
end;
$$;

grant execute on function public.confirm_ride_completion(uuid, boolean) to authenticated;
