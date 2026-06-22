-- Handmatig de per-locatie service-fee (€/kWh) zetten. Upsert de rij van vandaag en behoudt de
-- bestaande bestuurders-tarieven van de laatste rij (die komen uit de offerte / e-Flux). p_fee NULL =
-- terug naar fallback (klant → org).
create or replace function public.set_location_service_fee(p_location_id uuid, p_fee numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_loc public.locations%rowtype;
  v_prev public.tariff_profiles%rowtype;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag de service-fee instellen' using errcode = '42501';
  end if;

  select * into v_loc from public.locations where id = p_location_id;
  if not found then raise exception 'Locatie niet gevonden'; end if;

  select * into v_prev from public.tariff_profiles
  where location_id = p_location_id order by valid_from desc limit 1;

  delete from public.tariff_profiles where location_id = p_location_id and valid_from = current_date;
  insert into public.tariff_profiles
    (client_id, location_id, echarging_fee_per_kwh, charge_rate_per_kwh, energy_cost_per_kwh,
     ere_rate_per_kwh, start_tariff, idle_tariff_per_min, valid_from)
  values (
    v_loc.client_id, p_location_id, p_fee,
    coalesce(v_prev.charge_rate_per_kwh, 0.55), coalesce(v_prev.energy_cost_per_kwh, 0.25),
    coalesce(v_prev.ere_rate_per_kwh, 0.10), coalesce(v_prev.start_tariff, 0),
    coalesce(v_prev.idle_tariff_per_min, 0), current_date);

  return jsonb_build_object('location_id', p_location_id, 'echarging_fee_per_kwh', p_fee);
end;
$$;

revoke all on function public.set_location_service_fee(uuid, numeric) from public, anon;
grant execute on function public.set_location_service_fee(uuid, numeric) to authenticated, service_role;
