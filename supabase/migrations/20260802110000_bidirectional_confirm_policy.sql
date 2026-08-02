-- Second bug found while verifying bidirectional matching: the matches
-- UPDATE policy was still "Drivers can confirm or decline matches for own
-- trips" (migration 20260730125139) - driver-only, a leftover from when
-- matching was rider-proposes/driver-confirms exclusively. A rider
-- responding to a driver-initiated invite had no RLS path to update the
-- match at all (confirmed AND declined both silently matched 0 rows).
--
-- Replace it with a policy scoped to "whoever did NOT propose this match" -
-- generalizes to either direction, and (same as the original hardening in
-- migration 20260731023942) still blocks the proposer from confirming their
-- own proposal.
drop policy "Drivers can confirm or decline matches for own trips" on public.matches;

create policy "Participants can respond to matches they did not propose" on public.matches
  for update using (
    proposed_by <> auth.uid()
    and auth.uid() in (
      select driver_id from public.trips where id = trip_id
      union
      select rider_id from public.ride_requests where id = ride_request_id
    )
  );
