-- Per-locatie tarief uit een offerte vastleggen in tariff_profiles. Er is geen DB-link locatie→offerte,
-- dus de offerte wordt expliciet meegegeven (vanuit de Tarieven-kaart op de locatie). De service-fee
-- komt uit de offerte-snapshot (pricing_result.echargingMarginPerKwh, al in €/kWh); bestuurders-tarieven
-- uit tariff_data/charge_rate_per_kwh (alleen-lezen referentie; e-Flux blijft de bron op de palen).
create or replace function public.upsert_location_tariff(p_location_id uuid, p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_loc public.locations%rowtype;
  v_quote public.quotes%rowtype;
  v_td jsonb;
  v_fee numeric; v_charge numeric; v_energy numeric; v_start numeric; v_idle numeric;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag tarieven instellen' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  if not found then raise exception 'Locatie niet gevonden'; end if;
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then raise exception 'Offerte niet gevonden'; end if;

  v_td    := coalesce(v_quote.tariff_data, '{}'::jsonb);
  v_fee   := nullif(v_quote.calculation_snapshot->'pricing_result'->>'echargingMarginPerKwh', '')::numeric;
  v_charge:= coalesce(v_quote.charge_rate_per_kwh, nullif(v_td->>'chargeTariffPerKwh', '')::numeric);
  v_energy:= coalesce(v_quote.energy_cost_per_kwh, nullif(v_td->>'energyCostPerKwh', '')::numeric);
  v_start := coalesce(nullif(v_td->>'startFeePerSession', '')::numeric, 0);
  v_idle  := coalesce(nullif(v_td->>'idleFeePerMinute', '')::numeric, 0);

  -- Vandaag opnieuw instellen vervangt de rij van vandaag; eerdere valid_from blijft historie.
  delete from public.tariff_profiles where location_id = p_location_id and valid_from = current_date;
  insert into public.tariff_profiles
    (client_id, location_id, echarging_fee_per_kwh, charge_rate_per_kwh, energy_cost_per_kwh,
     start_tariff, idle_tariff_per_min, valid_from)
  values (v_loc.client_id, p_location_id, v_fee, coalesce(v_charge, 0.55), coalesce(v_energy, 0.25),
     v_start, v_idle, current_date);

  return jsonb_build_object('location_id', p_location_id, 'quote_id', p_quote_id,
    'echarging_fee_per_kwh', v_fee, 'charge_rate_per_kwh', v_charge,
    'energy_cost_per_kwh', v_energy, 'start_tariff', v_start, 'idle_tariff_per_min', v_idle);
end;
$$;

revoke all on function public.upsert_location_tariff(uuid, uuid) from public, anon;
grant execute on function public.upsert_location_tariff(uuid, uuid) to authenticated, service_role;
