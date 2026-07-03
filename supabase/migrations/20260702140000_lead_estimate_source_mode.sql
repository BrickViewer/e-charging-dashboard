-- Lead-schatting bestuurbaar maken: modus-keuze (berekend gemiddelde vs vaste waarde)
-- + RPC die het berekende gemiddelde, de vaste waarde, de modus en de effectieve waarde teruggeeft.

alter table public.organizations
  add column if not exists lead_estimate_source text not null default 'computed'
    check (lead_estimate_source in ('computed','manual'));

comment on column public.organizations.lead_estimate_source is
  'Bron voor de lead-schatting: ''computed'' = berekend gemiddelde (terugval op '
  'avg_annual_revenue_per_charge_point bij te weinig data), ''manual'' = altijd de vaste waarde.';

create or replace function public.avg_echarging_revenue_per_charge_point()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_window_start  date    := (date_trunc('month', now()) - interval '12 months')::date;
  v_window_end    date    := date_trunc('month', now())::date;  -- lopende maand uitgesloten
  v_fee_total     numeric := 0;
  v_months        integer := 0;
  v_charge_points integer := 0;
  v_computed      numeric;
  v_manual        numeric;
  v_mode          text;
  v_value         numeric;
  v_source        text;
begin
  if not app_private.is_internal(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select coalesce(sum(s.echarging_revenue), 0),
         count(distinct date_trunc('month', s.period_start))
    into v_fee_total, v_months
  from public.settlements s
  where s.period_start >= v_window_start
    and s.period_start <  v_window_end
    and s.status <> 'live';

  select count(*)
    into v_charge_points
  from public.charge_points cp
  join public.locations l on l.id = cp.location_id
  where l.archived_at is null
    and l.client_id in (
      select distinct s.client_id
      from public.settlements s
      where s.period_start >= v_window_start
        and s.period_start <  v_window_end
        and s.status <> 'live'
    );

  select o.avg_annual_revenue_per_charge_point, o.lead_estimate_source
    into v_manual, v_mode
  from public.organizations o
  limit 1;

  v_mode := coalesce(v_mode, 'computed');

  if v_charge_points > 0 and v_months > 0 and v_fee_total > 0 then
    v_computed := (v_fee_total / v_months) * 12.0 / v_charge_points;
  else
    v_computed := null;
  end if;

  if v_mode = 'manual' then
    if v_manual is not null and v_manual > 0 then
      v_value := v_manual; v_source := 'manual';
    else
      v_value := null; v_source := 'none';
    end if;
  else  -- 'computed'
    if v_computed is not null then
      v_value := v_computed; v_source := 'computed';
    elsif v_manual is not null and v_manual > 0 then
      v_value := v_manual; v_source := 'fallback';
    else
      v_value := null; v_source := 'none';
    end if;
  end if;

  return jsonb_build_object(
    'value',          v_value,
    'source',         v_source,
    'computed_value', v_computed,
    'manual_value',   v_manual,
    'mode',           v_mode,
    'months',         v_months,
    'charge_points',  v_charge_points,
    'fee_total',      v_fee_total
  );
end;
$$;

revoke all on function public.avg_echarging_revenue_per_charge_point() from public;
grant execute on function public.avg_echarging_revenue_per_charge_point() to authenticated;
