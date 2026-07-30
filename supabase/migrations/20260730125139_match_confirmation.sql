-- Riders can propose a match for one of their own ride requests (picking a
-- candidate trip from find_candidate_trips). This supersedes the original
-- Phase 0 assumption that matches would only ever be created server-side -
-- in practice the rider proposing a match *is* the client-side action that
-- needs to happen, and the insert is scoped tightly to their own requests.
create policy "Riders can propose matches for own ride requests" on public.matches
  for insert with check (
    exists (
      select 1 from public.ride_requests
      where id = ride_request_id and rider_id = auth.uid()
    )
  );

-- Replace the original both-participants update policy: only the trip's
-- driver can confirm/decline a match. The rider's side of "both sides
-- confirm" is the insert above; the driver's confirmation is the second and
-- final step, after which get_match_contact() (below) starts returning data.
drop policy "Participants can update own matches" on public.matches;

create policy "Drivers can confirm or decline matches for own trips" on public.matches
  for update using (
    auth.uid() in (select driver_id from public.trips where id = trip_id)
  );

-- Returns the other participant's email for a confirmed match, or null if
-- the match isn't confirmed yet or the caller isn't a participant. Security
-- definer is required here since public.users' own RLS only lets someone
-- see their own row - this function is the deliberate, narrow exception,
-- gated entirely by the WHERE/CASE logic below rather than by trusting the
-- caller.
create function public.get_match_contact(match_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  contact_email text;
begin
  select case
    when auth.uid() = driver.id then rider.email
    when auth.uid() = rider.id then driver.email
    else null
  end
  into contact_email
  from public.matches m
  join public.trips t on t.id = m.trip_id
  join public.ride_requests rr on rr.id = m.ride_request_id
  join public.users driver on driver.id = t.driver_id
  join public.users rider on rider.id = rr.rider_id
  where m.id = match_id and m.status = 'confirmed';

  return contact_email;
end;
$$;

grant execute on function public.get_match_contact(uuid) to authenticated;
