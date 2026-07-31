-- Two gaps found during final review of the matches RLS policies:
--
-- 1. The rider-insert policy (20260730125139) only checked ride_request_id
--    ownership, not the `status` value being inserted. A rider could send
--    status: 'confirmed' directly (bypassing the app UI) and self-confirm a
--    match without the driver's consent, which would then let
--    get_match_contact() reveal the driver's email without them ever having
--    agreed. Fix: require status = 'pending' on insert.
--
-- 2. The driver-update policy only checks trip ownership, not which columns
--    change. Since no WITH CHECK was given, Postgres reuses the USING clause
--    for validation too - which only re-checks trip_id, not ride_request_id.
--    A driver could UPDATE a pending match's ride_request_id to point at an
--    uninvolved rider's request (keeping trip_id as their own trip, so the
--    check still passes) and confirm it, revealing that rider's email
--    without them ever having requested this driver's trip. Fix: a trigger
--    that makes trip_id/ride_request_id/suggested_cost_split immutable after
--    creation - status is the only column that should ever change via
--    update.
drop policy "Riders can propose matches for own ride requests" on public.matches;

create policy "Riders can propose matches for own ride requests" on public.matches
  for insert with check (
    status = 'pending'
    and exists (
      select 1 from public.ride_requests
      where id = ride_request_id and rider_id = auth.uid()
    )
  );

create function public.prevent_match_identity_tampering()
returns trigger
language plpgsql
as $$
begin
  if new.trip_id <> old.trip_id
    or new.ride_request_id <> old.ride_request_id
    or new.suggested_cost_split is distinct from old.suggested_cost_split
  then
    raise exception 'trip_id, ride_request_id, and suggested_cost_split cannot be changed after a match is created.';
  end if;
  return new;
end;
$$;

create trigger prevent_match_identity_tampering_trigger
  before update on public.matches
  for each row execute function public.prevent_match_identity_tampering();
