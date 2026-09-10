-- Free-text user feedback, submitted via an optional in-app popup (see
-- FeedbackPopup.tsx). Read access is deliberately service_role-only (no
-- select policy for authenticated/anon) - this is for the builder's own
-- review, not something other signed-in users should be able to browse,
-- consistent with this project's existing privacy posture.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- ~1500 words is enforced client-side (the actual word-count limit the
  -- user asked for); this is a generous character-count backstop only.
  message text not null check (char_length(message) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on public.feedback (created_at);
create index feedback_user_id_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

create policy "Users can submit their own feedback" on public.feedback
  for insert with check (auth.uid() = user_id);
