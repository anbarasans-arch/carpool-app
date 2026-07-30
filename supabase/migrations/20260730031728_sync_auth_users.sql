-- Create a public.users profile row whenever a new Supabase Auth user is
-- created, so the app's own tables always have somewhere to attach
-- driver_id/rider_id once someone finishes email verification.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, verified_at)
  values (new.id, new.email, new.email_confirmed_at);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
