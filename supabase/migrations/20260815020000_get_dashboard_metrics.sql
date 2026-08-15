-- Backs the dashboard-metrics Edge Function (Carpool Pulse's daily
-- scheduled refresh). Returns aggregate usage numbers only (counts, no
-- per-user rows, no PII) as a single jsonb payload so the Edge Function can
-- fetch everything in one round trip.
--
-- Locked to service_role only, same defense-in-depth pattern as the
-- send_transactional_email fix (20260803040000): the Edge Function's shared
-- secret check is the first gate, this revoke is the second - knowing the
-- public anon key must never be enough to pull aggregate stats about every
-- user.
create function public.get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  daily jsonb;
  monthly jsonb;
  domains jsonb;
  kpi jsonb;
begin
  select jsonb_agg(row_to_json(d)) into daily from (
    with real_users as (
      select id from auth.users where email not like 'anbarasan.santhalingam%'
    ),
    days as (
      select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as d
    )
    select
      to_char(days.d, 'MM-DD') as date,
      coalesce((select count(*) from real_users ru join auth.users u on u.id = ru.id where u.created_at::date = days.d), 0) as signups,
      coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where t.created_at::date = days.d), 0) as trips,
      coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where rr.created_at::date = days.d), 0) as requests,
      coalesce((select count(*) from public.matches m where m.created_at::date = days.d), 0) as matches
    from days
    order by days.d
  ) d;

  select jsonb_agg(row_to_json(m)) into monthly from (
    with real_users as (
      select id from auth.users where email not like 'anbarasan.santhalingam%'
    )
    select
      to_char(gm, 'Mon YYYY') as month,
      coalesce((select count(*) from auth.users u join real_users ru on ru.id = u.id where date_trunc('month', u.created_at) = gm), 0) as signups,
      coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where date_trunc('month', t.created_at) = gm), 0) as trips,
      coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where date_trunc('month', rr.created_at) = gm), 0) as requests,
      coalesce((select count(*) from public.matches where date_trunc('month', created_at) = gm), 0) as matches
    from generate_series(date_trunc('month', '2026-07-01'::date), date_trunc('month', current_date), interval '1 month') as gm
    order by gm
  ) m;

  select jsonb_agg(row_to_json(dm)) into domains from (
    select split_part(email, '@', 2) as domain, count(*) as count
    from auth.users
    where email not like 'anbarasan.santhalingam%'
    group by 1
    order by count desc
  ) dm;

  with real_users as (
    select id, created_at from auth.users where email not like 'anbarasan.santhalingam%'
  )
  select jsonb_build_object(
    'real_signups', (select count(*) from real_users),
    'signups_7d', (select count(*) from real_users where created_at > now() - interval '7 days'),
    'total_trips', (select count(*) from public.trips t join real_users r on r.id = t.driver_id),
    'trips_active_upcoming', (select count(*) from public.trips t join real_users r on r.id = t.driver_id where t.status = 'active' and t.departure_time > now()),
    'total_requests', (select count(*) from public.ride_requests rr join real_users r on r.id = rr.rider_id),
    'requests_active_upcoming', (select count(*) from public.ride_requests rr join real_users r on r.id = rr.rider_id where rr.status = 'open' and rr.desired_time_end > now()),
    'matches_pending', (select count(*) from public.matches where status = 'pending'),
    'matches_confirmed', (select count(*) from public.matches where status = 'confirmed'),
    'matches_declined', (select count(*) from public.matches where status = 'declined'),
    'activated', (select count(*) from real_users ru where exists (
        select 1 from public.trips t where t.driver_id = ru.id
        union select 1 from public.ride_requests rr where rr.rider_id = ru.id
    ))
  ) into kpi;

  return jsonb_build_object(
    'daily', daily,
    'monthly', monthly,
    'domains', domains,
    'kpi', kpi,
    'generated_at', now()
  );
end;
$$;

revoke execute on function public.get_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.get_dashboard_metrics() to service_role;
