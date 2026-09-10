-- Tracks how many times the app has had an opportunity to show the
-- feedback popup for this user (incremented once per app open while
-- signed in - see App.tsx). The popup is only actually shown when this
-- count is a multiple of 7, i.e. roughly 1 out of every 7 opens, so it
-- doesn't nag on every single visit.
alter table public.users add column feedback_prompt_count integer not null default 0;

create function public.increment_feedback_prompt_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  update public.users
  set feedback_prompt_count = feedback_prompt_count + 1
  where id = auth.uid()
  returning feedback_prompt_count into new_count;
  return new_count;
end;
$$;

grant execute on function public.increment_feedback_prompt_count() to authenticated;
