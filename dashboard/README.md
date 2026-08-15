# Carpool Pulse dashboard

`template.html` is the usage dashboard published at:
https://claude.ai/code/artifact/aa384c84-b489-436b-90f8-1bf3fd27d566

A daily scheduled job regenerates it automatically (~6pm) by re-running the
queries below against Supabase project `ydccfhgvspwefpyooldw`, splicing the
results into `template.html`'s `DAILY`, `MONTHLY`, `DOMAINS`, and `KPI`
JS objects (leave everything else - styles, layout, embedded font -
untouched), updating the "Snapshot as of" date, and republishing to the
same URL above via the Artifact tool.

All queries exclude the builder's own test accounts (`email like
'anbarasan.santhalingam%'`) - keep that filter in place.

## Daily series (last 30 days) -> DAILY

```sql
with real_users as (
  select id from auth.users where email not like 'anbarasan.santhalingam%'
),
days as (
  select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as d
)
select
  to_char(days.d, 'MM-DD') as date,
  coalesce((select count(*) from real_users ru join auth.users u on u.id = ru.id where u.created_at::date = days.d), 0) as signups,
  coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where t.created_at::date = days.d), 0) as trips_posted,
  coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where rr.created_at::date = days.d), 0) as ride_requests_posted,
  coalesce((select count(*) from public.matches m where m.created_at::date = days.d), 0) as matches_created
from days
order by days.d;
```

## Monthly series (since launch) -> MONTHLY

```sql
with real_users as (
  select id from auth.users where email not like 'anbarasan.santhalingam%'
)
select
  to_char(m, 'Mon YYYY') as month,
  coalesce((select count(*) from auth.users u join real_users ru on ru.id = u.id where date_trunc('month', u.created_at) = m), 0) as signups,
  coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where date_trunc('month', t.created_at) = m), 0) as trips_posted,
  coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where date_trunc('month', rr.created_at) = m), 0) as ride_requests_posted,
  coalesce((select count(*) from public.matches where date_trunc('month', created_at) = m), 0) as matches_created
from generate_series(date_trunc('month', '2026-07-01'::date), date_trunc('month', current_date), interval '1 month') as m
order by m;
```

## KPI totals -> KPI

```sql
with real_users as (
  select id, email, created_at from auth.users where email not like 'anbarasan.santhalingam%'
)
select
  (select count(*) from real_users) as real_signups,
  (select count(*) from real_users where created_at > now() - interval '7 days') as signups_7d,
  (select count(*) from public.trips t join real_users r on r.id = t.driver_id) as total_trips,
  (select count(*) from public.trips t join real_users r on r.id = t.driver_id where t.status='active' and t.departure_time > now()) as trips_active_upcoming,
  (select count(*) from public.ride_requests rr join real_users r on r.id = rr.rider_id) as total_requests,
  (select count(*) from public.ride_requests rr join real_users r on r.id = rr.rider_id where rr.status='open' and rr.desired_time_end > now()) as requests_active_upcoming,
  (select count(*) from public.matches where status='pending') as matches_pending,
  (select count(*) from public.matches where status='confirmed') as matches_confirmed,
  (select count(*) from public.matches where status='declined') as matches_declined,
  (select count(*) from real_users ru where exists (
      select 1 from public.trips t where t.driver_id = ru.id
      union select 1 from public.ride_requests rr where rr.rider_id = ru.id
  )) as activated;
```

## Domain breakdown -> DOMAINS

```sql
select split_part(email, '@', 2) as domain, count(*) as count
from auth.users
where email not like 'anbarasan.santhalingam%'
group by 1
order by count desc;
```

## Notes for whoever (or whatever agent) regenerates this

- Trend annotation on the "Ride requests" sparkline (`annotateIndex`/`annotateLabel`
  in the trends array) points at 08-13, the day the bulk multi-date picker
  feature caused a real usage spike. Leave it pinned there - it's a real
  event, not decoration - unless a new event is more notable, in which case
  move it.
- If a metric's peak value changes significantly (e.g. daily signups exceeds
  what the current y-scale expects), the sparkline function auto-scales, so
  no manual adjustment needed.
- `real_signups` should stay a fixed historical count as the pilot grows -
  don't reset or filter differently between runs, or day-over-day comparisons
  break.
