-- Decrement the trip's seats_available when a match is confirmed, and
-- block the confirm entirely if the trip has no seats left. The atomic
-- "UPDATE ... WHERE seats_available > 0" + row-count check closes the race
-- where two pending matches on the same trip get confirmed back-to-back -
-- only one can win the last seat.
--
-- No security definer needed: the confirming driver already has UPDATE
-- rights on their own trip via the existing "Drivers can update own trips"
-- RLS policy, so this runs fine under the caller's own privileges.
--
-- find_candidate_trips already filters on t.seats_available > 0, so once
-- this lands, a fully-booked trip stops showing up as a candidate for new
-- ride requests automatically - no other query needs to change.
create function public.decrement_trip_seats_on_confirm()
returns trigger
language plpgsql
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

create trigger decrement_trip_seats_on_confirm_trigger
  before update on public.matches
  for each row execute function public.decrement_trip_seats_on_confirm();
