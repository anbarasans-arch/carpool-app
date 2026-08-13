-- Lets a signed-in user set their own home_region_id (used by the city
-- picker on first sign-in). Can't just add a client update policy for this -
-- the "Users can update own profile" policy was deliberately dropped
-- (migration 20260803050000) after it let a user overwrite their own
-- `email` to an arbitrary unverified value. This function only ever touches
-- home_region_id, scoped to auth.uid(), so it can't reopen that hole.
create function public.set_home_region(new_region_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.regions where id = new_region_id and active) then
    raise exception 'Unknown region.';
  end if;

  update public.users set home_region_id = new_region_id where id = auth.uid();
end;
$$;

grant execute on function public.set_home_region(text) to authenticated;
