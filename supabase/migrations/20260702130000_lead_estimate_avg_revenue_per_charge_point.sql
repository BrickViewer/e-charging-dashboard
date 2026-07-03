-- Leads-schatting op basis van gemiddelde E-Charging service-fee-omzet per laadpaal.
-- (a) instelbare terugval-constante op organizations, (b) aggregatie-RPC.

alter table public.organizations
  add column if not exists avg_annual_revenue_per_charge_point numeric;

comment on column public.organizations.avg_annual_revenue_per_charge_point is
  'Terugval voor de lead-schatting: gemiddelde E-Charging service-fee-omzet per laadpaal per jaar, '
  'gebruikt zolang er te weinig echte settlement-data is. NULL/0 = geen terugval (schatting verborgen).';

-- Gemiddelde E-Charging service-fee (echarging_revenue) per actieve laadpaal per jaar.
-- Gemodelleerd op admin_settlement_kpis. Is-internal-gated; geeft alleen een geaggregeerd
-- scalair terug (geen per-klant financiele details).
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
  v_value         numeric;
  v_source        text;
  v_fallback      numeric;
begin
  if not app_private.is_internal(auth.uid()) then
    raise exception 'forbidden';
  end if;

  -- Teller (som service-fee) + aantal maanden met data in het venster; 'live' uitgesloten.
  -- fee_waived-maanden zijn al genuld (echarging_revenue = 0), dus geen aparte afhandeling.
  select coalesce(sum(s.echarging_revenue), 0),
         count(distinct date_trunc('month', s.period_start))
    into v_fee_total, v_months
  from public.settlements s
  where s.period_start >= v_window_start
    and s.period_start <  v_window_end
    and s.status <> 'live';

  -- Noemer: niet-gearchiveerde laadpalen van klanten die in het venster settlen
  -- (koppelt teller en noemer aan dezelfde populatie).
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

  select o.avg_annual_revenue_per_charge_point
    into v_fallback
  from public.organizations o
  limit 1;

  if v_charge_points > 0 and v_months > 0 and v_fee_total > 0 then
    v_value  := (v_fee_total / v_months) * 12.0 / v_charge_points;
    v_source := 'computed';
  elsif v_fallback is not null and v_fallback > 0 then
    v_value  := v_fallback;
    v_source := 'fallback';
  else
    v_value  := null;
    v_source := 'none';
  end if;

  return jsonb_build_object(
    'value',         v_value,
    'source',        v_source,
    'months',        v_months,
    'charge_points', v_charge_points,
    'fee_total',     v_fee_total
  );
end;
$$;

revoke all on function public.avg_echarging_revenue_per_charge_point() from public;
grant execute on function public.avg_echarging_revenue_per_charge_point() to authenticated;
