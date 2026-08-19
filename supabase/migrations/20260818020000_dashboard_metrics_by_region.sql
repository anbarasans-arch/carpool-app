-- Rewrites get_dashboard_metrics() (20260815020000) to tag every row with
-- region_id instead of pre-summing across all cities. Lets the dashboard
-- show per-city breakdowns and an "All cities" combined view (summed
-- client-side), and means a newly-added city (config/regions.ts + a
-- regions-table insert) shows up automatically with zero further changes
-- to this function or the dashboard page - it's driven entirely by the
-- active rows in `regions`.
--
-- Signups are attributed by the user's home_region_id (public.users);
-- trips/ride_requests by their own region_id column; matches via their
-- trip's region_id (a match's trip and ride_request always share a region -
-- enforced by the region-scoped matching functions, so either side works).
create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  regions_json jsonb;
  daily jsonb;
  monthly jsonb;
  domains jsonb;
  kpi jsonb;
begin
  select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) into regions_json
  from public.regions
  where active;

  select jsonb_agg(row_to_json(d)) into daily from (
    with real_users as (
      select u.id, pu.home_region_id
      from auth.users u
      join public.users pu on pu.id = u.id
      where u.email not like 'anbarasan.santhalingam%'
    ),
    days as (
      select generate_series(current_date - interval '29 days', current_date, interval '1 day')::date as day
    ),
    region_days as (
      select r.id as region_id, days.day
      from public.regions r
      cross join days
      where r.active
    )
    select
      rd.region_id,
      to_char(rd.day, 'MM-DD') as date,
      coalesce((select count(*) from real_users ru join auth.users u on u.id = ru.id
                where ru.home_region_id = rd.region_id and u.created_at::date = rd.day), 0) as signups,
      coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id
                where t.region_id = rd.region_id and t.created_at::date = rd.day), 0) as trips,
      coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id
                where rr.region_id = rd.region_id and rr.created_at::date = rd.day), 0) as requests,
      coalesce((select count(*) from public.matches m join public.trips t on t.id = m.trip_id
                where t.region_id = rd.region_id and m.created_at::date = rd.day), 0) as matches
    from region_days rd
    order by rd.region_id, rd.day
  ) d;

  select jsonb_agg(row_to_json(m)) into monthly from (
    with real_users as (
      select u.id, pu.home_region_id
      from auth.users u
      join public.users pu on pu.id = u.id
      where u.email not like 'anbarasan.santhalingam%'
    ),
    months as (
      select generate_series(date_trunc('month', '2026-07-01'::date), date_trunc('month', current_date), interval '1 month') as gm
    ),
    region_months as (
      select r.id as region_id, months.gm
      from public.regions r
      cross join months
      where r.active
    )
    select
      rm.region_id,
      to_char(rm.gm, 'Mon YYYY') as month,
      coalesce((select count(*) from real_users ru join auth.users u on u.id = ru.id
                where ru.home_region_id = rm.region_id and date_trunc('month', u.created_at) = rm.gm), 0) as signups,
      coalesce((select count(*) from public.trips t join real_users ru on ru.id = t.driver_id
                where t.region_id = rm.region_id and date_trunc('month', t.created_at) = rm.gm), 0) as trips,
      coalesce((select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id
                where rr.region_id = rm.region_id and date_trunc('month', rr.created_at) = rm.gm), 0) as requests,
      coalesce((select count(*) from public.matches m join public.trips t on t.id = m.trip_id
                where t.region_id = rm.region_id and date_trunc('month', m.created_at) = rm.gm), 0) as matches
    from region_months rm
    order by rm.region_id, rm.gm
  ) m;

  select jsonb_agg(row_to_json(dm)) into domains from (
    select pu.home_region_id as region_id, split_part(u.email, '@', 2) as domain, count(*) as count
    from auth.users u
    join public.users pu on pu.id = u.id
    where u.email not like 'anbarasan.santhalingam%'
      and pu.home_region_id is not null
    group by 1, 2
    order by pu.home_region_id, count desc
  ) dm;

  select jsonb_agg(row_to_json(k)) into kpi from (
    with real_users as (
      select u.id, u.created_at, pu.home_region_id
      from auth.users u
      join public.users pu on pu.id = u.id
      where u.email not like 'anbarasan.santhalingam%'
    )
    select
      r.id as region_id,
      (select count(*) from real_users ru where ru.home_region_id = r.id) as real_signups,
      (select count(*) from real_users ru where ru.home_region_id = r.id and ru.created_at > now() - interval '7 days') as signups_7d,
      (select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where t.region_id = r.id) as total_trips,
      (select count(*) from public.trips t join real_users ru on ru.id = t.driver_id where t.region_id = r.id and t.status = 'active' and t.departure_time > now()) as trips_active_upcoming,
      (select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where rr.region_id = r.id) as total_requests,
      (select count(*) from public.ride_requests rr join real_users ru on ru.id = rr.rider_id where rr.region_id = r.id and rr.status = 'open' and rr.desired_time_end > now()) as requests_active_upcoming,
      (select count(*) from public.matches m join public.trips t on t.id = m.trip_id where t.region_id = r.id and m.status = 'pending') as matches_pending,
      (select count(*) from public.matches m join public.trips t on t.id = m.trip_id where t.region_id = r.id and m.status = 'confirmed') as matches_confirmed,
      (select count(*) from public.matches m join public.trips t on t.id = m.trip_id where t.region_id = r.id and m.status = 'declined') as matches_declined,
      (select count(*) from real_users ru where ru.home_region_id = r.id and exists (
          select 1 from public.trips t where t.driver_id = ru.id and t.region_id = r.id
          union select 1 from public.ride_requests rr where rr.rider_id = ru.id and rr.region_id = r.id
      )) as activated
    from public.regions r
    where r.active
  ) k;

  return jsonb_build_object(
    'regions', regions_json,
    'daily', daily,
    'monthly', monthly,
    'domains', domains,
    'kpi', kpi,
    'generated_at', now()
  );
end;
$$;
