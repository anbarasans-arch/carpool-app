-- Bug found while verifying bidirectional matching (migration
-- 20260802090000): decrement_trip_seats_on_confirm (migration
-- 20260802080000) ran as invoker, relying on the confirming user already
-- having UPDATE rights on the trip via "Drivers can update own trips" RLS.
-- That was true when only drivers could confirm (the original rider-
-- proposes/driver-confirms flow), but now a rider can be the one
-- confirming too (when the driver proposed) - and a rider has no RLS
-- rights to update someone else's trip, so the internal seat-decrement
-- silently matched 0 rows and raised "This trip has no seats left" even
-- with seats open, blocking the confirm entirely.
--
-- Fix: security definer, since by the time this trigger fires the outer
-- matches UPDATE has already been authorized by "Participants can update
-- own matches" - confirming is already legitimate, this just needs to
-- bypass trips' RLS to record the side effect regardless of which
-- participant did the confirming.
create or replace function public.decrement_trip_seats_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_rows int;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    update public.trips
    set seats_available = seats_available - 1
    where id = new.trip_id and seats_available > 0;

    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      raise exception 'This trip has no seats left.';
    end if;
  end if;
  return new;
end;
$$;
