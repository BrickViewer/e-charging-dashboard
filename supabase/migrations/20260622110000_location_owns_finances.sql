-- Financiële data hoort bij de LOCATIE; schone, overdraagbare eigendom.
-- De locatie is de duurzame drager van haar sessie-grootboek. Eigendom (locations.client_id)
-- is overdraagbaar: niet-afgerekende sessies volgen de nieuwe eigenaar; afgerekende (finale)
-- sessies + settlements blijven bij de oude eigenaar. Eén interne primitive (park_location)
-- regelt alles; set_location_client (publieke RPC) en erase_client_for_privacy delegeren ernaar.

-- 1) Amsterdam-periode + "afgerekend?"-predicate — exact dezelfde bucketing als aggregate-settlements.
create or replace function app_private.session_period(p_started_at timestamptz)
returns table (yr integer, mo integer)
language sql immutable parallel safe
set search_path to 'public'
as $$
  select extract(year  from (p_started_at at time zone 'Europe/Amsterdam'))::int,
         extract(month from (p_started_at at time zone 'Europe/Amsterdam'))::int;
$$;

create or replace function app_private.session_is_settled(p_client_id uuid, p_started_at timestamptz)
returns boolean
language sql stable
set search_path to 'public'
as $$
  select p_client_id is not null and exists (
    select 1
    from public.settlements s, app_private.session_period(p_started_at) sp
    where s.client_id = p_client_id
      and s.year = sp.yr and s.month = sp.mo
      and s.status = any (array['approved','paid','invoice_sent','invoice_paid','charged_back'])
  );
$$;

-- 2) Interne primitive (GEEN authz; alleen via definer-functies aanroepbaar): verplaats de
--    niet-afgerekende sessies + open settlements en zet de eigenaar (NULL = parkeren/eigenaarloos).
create or replace function app_private.park_location(p_location_id uuid, p_new_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_location public.locations%rowtype;
  v_previous_client_id uuid;
  v_action text;
  v_reassigned_sessions integer := 0;
  v_retained_final_sessions integer := 0;
  v_deleted_open_settlements integer := 0;
begin
  -- Guard AAN vóór elke client_id-mutatie: de eigendoms-pin op charging_sessions én de
  -- guard-trigger op locations laten de wijziging dan toe. (Transaction-local; reset vanzelf.)
  perform set_config('app.allow_location_client_change', 'on', true);

  select * into v_location from public.locations l where l.id = p_location_id for update;
  if not found then raise exception 'Locatie niet gevonden'; end if;
  v_previous_client_id := v_location.client_id;

  -- Scope: elke sessie op de locatie, getagd afgerekend/niet-afgerekend (Amsterdam-maand).
  drop table if exists pg_temp.park_scope;
  create temp table pg_temp.park_scope on commit drop as
  select cs.id, cs.client_id as old_client_id, sp.yr, sp.mo,
         app_private.session_is_settled(cs.client_id, cs.started_at) as is_final
  from public.charging_sessions cs
  cross join lateral app_private.session_period(cs.started_at) sp
  where cs.location_id = p_location_id;

  select count(*) into v_retained_final_sessions from pg_temp.park_scope where is_final;

  -- Alleen OPEN settlements (live/calculated, nog geen factuur) van de betrokken oude + nieuwe
  -- eigenaar + maand verwijderen; aggregate-settlements herberekent ze. Finale blijven staan.
  with affected as (
    select old_client_id as cid, yr, mo from pg_temp.park_scope where not is_final and old_client_id is not null
    union
    select p_new_client_id, yr, mo from pg_temp.park_scope where not is_final and p_new_client_id is not null
  ),
  locked as (
    select s.id
    from public.settlements s
    join affected a on a.cid = s.client_id and a.yr = s.year and a.mo = s.month
    where s.status in ('live','calculated') and s.invoice_number is null
    for update
  )
  delete from public.settlements s using locked l where s.id = l.id;
  get diagnostics v_deleted_open_settlements = row_count;

  -- Alleen niet-afgerekende sessies verplaatsen naar de nieuwe eigenaar (NULL = parkeren).
  update public.charging_sessions cs
  set client_id = p_new_client_id, updated_at = now()
  from pg_temp.park_scope sc
  where cs.id = sc.id and not sc.is_final and cs.client_id is distinct from p_new_client_id;
  get diagnostics v_reassigned_sessions = row_count;

  update public.locations l
  set client_id = p_new_client_id,
      client_assigned_at = case
        when p_new_client_id is null then null
        when v_previous_client_id is distinct from p_new_client_id then now()
        else l.client_assigned_at end,
      updated_at = now()
  where l.id = p_location_id
  returning * into v_location;

  v_action := case when p_new_client_id is null then 'location_unlinked' else 'location_linked' end;
  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (
    coalesce(p_new_client_id, v_previous_client_id), auth.uid(), v_action,
    case when p_new_client_id is null then 'Locatie geparkeerd (ontkoppeld)' else 'Locatie gekoppeld aan klant' end,
    jsonb_build_object('location_id', p_location_id, 'previous_client_id', v_previous_client_id,
      'client_id', p_new_client_id, 'reassigned_sessions', v_reassigned_sessions,
      'retained_final_sessions', v_retained_final_sessions, 'deleted_open_settlements', v_deleted_open_settlements)
  );

  return jsonb_build_object('location', to_jsonb(v_location),
    'previous_client_id', v_previous_client_id, 'client_id', p_new_client_id,
    'reassigned_sessions', v_reassigned_sessions, 'retained_final_sessions', v_retained_final_sessions,
    'deleted_open_settlements', v_deleted_open_settlements);
end;
$$;

revoke all on function app_private.park_location(uuid, uuid) from public;

-- 3) Publieke RPC: authz + bestaanscheck, dan delegeren. ZELFDE signatuur (geen frontend-ripple).
--    Vervangt de kapotte versie die naar het niet-bestaande quarterly_settlements verwees.
create or replace function public.set_location_client(location_id uuid, client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag locaties koppelen' using errcode = '42501';
  end if;
  if client_id is not null and not exists (
    select 1 from public.clients c where c.id = client_id and coalesce(c.status,'actief') <> 'verwijderd'
  ) then
    raise exception 'Klant niet gevonden of verwijderd';
  end if;
  return app_private.park_location(location_id, client_id);
end;
$$;

-- 4) Concurrerende auto-move-trigger weg: park_location is voortaan de enige mover van eigendom.
drop trigger if exists trg_cascade_location_client_link on public.locations;
drop function if exists public.cascade_location_client_link();

-- 5) erase_client_for_privacy: parkeer elke locatie via de primitive i.p.v. alleen client_id NULL-en,
--    zodat niet-afgerekende sessies eigenaarloos worden + open settlements verdwijnen; finale omzet
--    blijft bij de (zo dadelijk geanonimiseerde) klant en blijft zichtbaar in financieel.
create or replace function public.erase_client_for_privacy(p_client_id uuid, p_reason text, p_performed_by uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_client public.clients%rowtype;
  v_portal_user_id uuid;
  v_erased_label text := 'Verwijderd klantprofiel';
  v_payment_details_deleted integer := 0;
  v_invitations_deleted integer := 0;
  v_locations_unlinked integer := 0;
  v_tariff_profiles_deleted integer := 0;
  v_quotes_scrubbed integer := 0;
  v_activity_log_scrubbed integer := 0;
  v_notifications_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_loc record;
  v_reason text := left(trim(coalesce(nullif(p_reason, ''), 'Klantprofiel verwijderd via admin')), 1000);
begin
  if p_performed_by is null
    or not app_private.has_role(p_performed_by, 'admin'::public.app_role)
  then
    raise exception 'Alleen admins mogen klantprofielen verwijderen' using errcode = '42501';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Klant niet gevonden' using errcode = 'P0002';
  end if;
  if v_client.status = 'verwijderd' then
    raise exception 'Klantprofiel is al verwijderd' using errcode = '23505';
  end if;

  v_portal_user_id := v_client.portal_user_id;

  delete from public.client_payment_details where client_id = p_client_id;
  get diagnostics v_payment_details_deleted = row_count;

  delete from public.client_invitations where client_id = p_client_id;
  get diagnostics v_invitations_deleted = row_count;

  delete from public.tariff_profiles where client_id = p_client_id;
  get diagnostics v_tariff_profiles_deleted = row_count;

  if v_portal_user_id is not null then
    delete from public.notifications where recipient_id = v_portal_user_id;
    get diagnostics v_notifications_deleted = row_count;
    delete from public.profiles where user_id = v_portal_user_id;
    get diagnostics v_profiles_deleted = row_count;
    update public.activity_log set user_id = null where user_id = v_portal_user_id;
  end if;

  update public.quotes
  set prospect_company = v_erased_label, prospect_contact = null, prospect_email = null,
      locations_data = null, calculation_snapshot = null, notes = null, updated_at = now()
  where client_id = p_client_id;
  get diagnostics v_quotes_scrubbed = row_count;

  update public.activity_log
  set description = 'Historische klantactiviteit geanonimiseerd', details = null,
      metadata = jsonb_build_object('deleted_profile', true, 'client_number', v_client.client_number)
  where client_id = p_client_id;
  get diagnostics v_activity_log_scrubbed = row_count;

  -- Parkeer elke gekoppelde locatie: niet-afgerekende sessies → eigenaarloos, open settlements weg.
  for v_loc in select id from public.locations where client_id = p_client_id loop
    perform app_private.park_location(v_loc.id, null);
    v_locations_unlinked := v_locations_unlinked + 1;
  end loop;

  update public.clients
  set company_name = v_erased_label, client_number = null, kvk = null, btw_number = null,
      contact_name = null, contact_email = null, contact_phone = null, billing_address = null,
      billing_address_street = null, billing_address_postal = null, billing_address_city = null,
      contract_start_date = null, contract_duration_months = null, revenue_share_percentage = null,
      charge_rate_per_kwh = null, energy_cost_per_kwh = null, ere_rate_per_kwh = null,
      monthly_platform_surcharge = 0, auto_renew = false, notice_period_months = 0,
      eflux_account_id = null, notes = null, portal_user_id = null,
      payment_onboarding_status = 'missing', payment_onboarding_submitted_at = null,
      payment_onboarding_verified_at = null, calculate_ere_enabled = false,
      status = 'verwijderd', erased_at = now(), erased_by = p_performed_by, erasure_reason = v_reason,
      updated_at = now()
  where id = p_client_id;

  insert into public.client_erasure_log (
    client_id, client_number, erased_client_label, performed_by, reason,
    payment_details_deleted, invitations_deleted, locations_unlinked, tariff_profiles_deleted,
    quotes_scrubbed, activity_log_scrubbed, notifications_deleted, profiles_deleted, metadata)
  values (
    p_client_id, v_client.client_number, v_erased_label, p_performed_by, v_reason,
    v_payment_details_deleted, v_invitations_deleted, v_locations_unlinked, v_tariff_profiles_deleted,
    v_quotes_scrubbed, v_activity_log_scrubbed, v_notifications_deleted, v_profiles_deleted,
    jsonb_build_object('portal_user_removed', v_portal_user_id is not null, 'previous_status', v_client.status));

  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (p_client_id, p_performed_by, 'client_profile_deleted', 'Klantprofiel verwijderd',
    jsonb_build_object('client_number', v_client.client_number, 'locations_unlinked', v_locations_unlinked,
      'payment_details_deleted', v_payment_details_deleted));

  return jsonb_build_object(
    'client_id', p_client_id, 'client_number', v_client.client_number,
    'erased_client_label', v_erased_label, 'portal_user_id', v_portal_user_id,
    'counts', jsonb_build_object(
      'payment_details_deleted', v_payment_details_deleted, 'invitations_deleted', v_invitations_deleted,
      'locations_unlinked', v_locations_unlinked, 'tariff_profiles_deleted', v_tariff_profiles_deleted,
      'quotes_scrubbed', v_quotes_scrubbed, 'activity_log_scrubbed', v_activity_log_scrubbed,
      'notifications_deleted', v_notifications_deleted, 'profiles_deleted', v_profiles_deleted));
end;
$function$;
