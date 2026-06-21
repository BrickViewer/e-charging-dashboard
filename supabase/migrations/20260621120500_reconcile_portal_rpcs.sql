-- ============================================================================
-- RECONCILIATIE-SNAPSHOT (Fase 0 architectuur-audit) — GEEN gedragswijziging.
-- De net-only portaal-RPC's bestaan al LIVE maar stonden niet in version control.
-- Verbatim uit pg_get_functiondef (project uuldldhmuanmjlyvnagt, 2026-06-21);
-- regex-escaping exact behouden. create or replace = no-op op live, herspeelbaar vers.
-- ============================================================================

create or replace function public.get_portal_dashboard_kpis()
 returns table(year integer, month integer, period_start date, period_end date, status text, is_final boolean, total_kwh numeric, total_customer_cashflow numeric, estimated_client_yield numeric, co2_kg_avoided numeric, ere_estimate numeric)
 language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_client_id uuid;
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  if v_client_id is null then return; end if;

  return query
  select
    s.year, s.month, s.period_start::date, s.period_end::date, s.status::text,
    (s.status in ('approved','paid','invoice_sent','invoice_paid','charged_back')) as is_final,
    coalesce(s.total_kwh, 0)::numeric as total_kwh,
    coalesce(s.client_payout, 0)::numeric as total_customer_cashflow,
    coalesce(s.client_payout, 0)::numeric as estimated_client_yield,
    (coalesce(s.total_kwh, 0)::numeric * 0.306)::numeric as co2_kg_avoided,
    coalesce(s.ere_estimate, 0)::numeric as ere_estimate
  from public.settlements s
  where s.client_id = v_client_id
  order by s.year desc, s.month desc;
end;
$function$;

create or replace function public.get_portal_invoice_context()
 returns table(org_name text, org_kvk text, org_address text, org_address_street text, org_address_postal text, org_address_city text, org_country text, org_email text, org_btw_number text, org_iban text, org_bic text, payout_account_holder_name text, payout_iban text, payout_bic text)
 language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_client_id uuid;
  v_internal boolean;
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  v_internal := app_private.is_internal(auth.uid());
  if v_client_id is null and not coalesce(v_internal, false) then return; end if;

  return query
  select
    o.name, o.kvk, o.address,
    o.address_street, o.address_postal, o.address_city, o.country,
    o.email, o.btw_number, o.iban, o.bic,
    d.payout_account_holder_name, d.payout_iban, d.payout_bic
  from (
    select name, kvk, address, address_street, address_postal, address_city,
           country, email, btw_number, iban, bic, created_at
    from public.organizations order by created_at limit 1
  ) o
  left join public.client_payment_details d
    on v_client_id is not null and d.client_id = v_client_id;
end;
$function$;

create or replace function public.get_portal_payment_details()
 returns table(client_id uuid, invoice_email text, payout_account_holder_name text, payout_iban_masked text, payout_iban_last4 text, payout_bic text, account_holder_confirmed boolean, status text, updated_at timestamp with time zone)
 language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_client_id uuid;
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  if v_client_id is null then return; end if;

  return query
  select
    d.client_id, d.invoice_email, d.payout_account_holder_name,
    case when d.payout_iban_last4 is null then null else '•••• ' || d.payout_iban_last4 end as payout_iban_masked,
    d.payout_iban_last4, d.payout_bic, d.account_holder_confirmed, d.status, d.updated_at
  from public.client_payment_details d
  where d.client_id = v_client_id;
end;
$function$;

create or replace function public.get_portal_sessions(p_from timestamp with time zone default null::timestamp with time zone, p_to timestamp with time zone default null::timestamp with time zone, p_location_id uuid default null::uuid, p_charge_point_id uuid default null::uuid, p_limit integer default 1000)
 returns table(id uuid, started_at timestamp with time zone, ended_at timestamp with time zone, duration_minutes integer, kwh_delivered numeric, charge_point_id uuid, charge_point_name text, location_name text, vergoeding numeric)
 language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_client_id uuid;
  v_fee numeric;
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  if v_client_id is null then return; end if;

  -- Fallback-tarief voor maanden zonder settlement-rij (bv. de allereerste sessies)
  select coalesce(c.echarging_fee_per_kwh,
           (select o.default_echarging_fee_per_kwh from public.organizations o order by o.created_at limit 1), 0.10)
    into v_fee from public.clients c where c.id = v_client_id;
  v_fee := coalesce(v_fee, 0.10);

  return query
  select
    cs.id, cs.started_at, cs.ended_at, cs.duration_minutes::integer, cs.kwh_delivered::numeric,
    cs.charge_point_id, cp.name as charge_point_name, l.name as location_name,
    -- Maand-snapshot van de fee (0 bij kwijtschelding); maandtoewijzing in Europe/Amsterdam.
    (coalesce(cs.reimbursement_amount, 0)
      - coalesce(st.echarging_fee_per_kwh, v_fee) * coalesce(cs.kwh_delivered, 0))::numeric as vergoeding
  from public.charging_sessions cs
  left join public.charge_points cp on cp.id = cs.charge_point_id
  left join public.locations    l  on l.id  = cs.location_id
  left join public.settlements  st on st.client_id = cs.client_id
    and st.year  = extract(year  from (cs.started_at at time zone 'Europe/Amsterdam'))::integer
    and st.month = extract(month from (cs.started_at at time zone 'Europe/Amsterdam'))::integer
  where cs.client_id = v_client_id
    and cs.excluded = false
    and (p_from is null or cs.started_at >= p_from)
    and (p_to   is null or cs.started_at <  p_to)
    and (p_location_id     is null or cs.location_id     = p_location_id)
    and (p_charge_point_id is null or cs.charge_point_id = p_charge_point_id)
  order by cs.started_at desc
  limit greatest(coalesce(p_limit, 1000), 1);
end;
$function$;

create or replace function public.update_portal_company_details(p_company_name text, p_kvk text, p_btw_number text, p_contact_first_name text, p_contact_last_name text, p_contact_email text, p_contact_country_code text, p_contact_phone text, p_billing_address_street text, p_billing_address_postal text, p_billing_address_city text, p_invoice_email text, p_calculate_ere_enabled boolean default false, p_vat_status text default null::text)
 returns void
 language plpgsql security definer set search_path to 'public', 'app_private'
as $function$
declare
  v_client_id uuid;
  v_btw text;
  v_contact_first_name text;
  v_contact_last_name text;
  v_contact_email text;
  v_contact_country_code text;
  v_contact_phone_digits text;
  v_kvk text;
  v_billing_postal text;
  v_invoice_email text;
  v_existing_iban text;
  v_vat_status text;
  v_effective_vat_status text;
  v_now timestamptz := now();
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  if v_client_id is null then
    raise exception 'Geen klantportaal gekoppeld aan deze gebruiker' using errcode = '42501';
  end if;

  v_vat_status := nullif(trim(coalesce(p_vat_status, '')), '');
  if v_vat_status is not null and v_vat_status not in ('vat_liable','kor','private') then
    raise exception 'Ongeldige BTW-status' using errcode = '22023';
  end if;

  select coalesce(v_vat_status, c.vat_status) into v_effective_vat_status
  from public.clients c where c.id = v_client_id;

  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '[\\s\\.-]+', '', 'g')), '');
  v_kvk := nullif(regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g'), '');
  v_billing_postal := upper(regexp_replace(trim(coalesce(p_billing_address_postal, '')), '\s+', '', 'g'));
  v_invoice_email := lower(trim(coalesce(p_invoice_email, '')));
  v_contact_first_name := trim(coalesce(p_contact_first_name, ''));
  v_contact_last_name := trim(coalesce(p_contact_last_name, ''));
  v_contact_email := lower(trim(coalesce(p_contact_email, '')));
  v_contact_country_code := trim(coalesce(p_contact_country_code, '+31'));
  v_contact_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');

  if v_contact_country_code in ('31', 'NL+31', 'NL +31') then v_contact_country_code := '+31'; end if;

  if left(v_contact_phone_digits, 4) = '0031' then
    v_contact_phone_digits := substring(v_contact_phone_digits from 5);
  elsif left(v_contact_phone_digits, 2) = '31' and length(v_contact_phone_digits) > 9 then
    v_contact_phone_digits := substring(v_contact_phone_digits from 3);
  end if;
  if left(v_contact_phone_digits, 1) = '0' then
    v_contact_phone_digits := substring(v_contact_phone_digits from 2);
  end if;

  if length(trim(coalesce(p_company_name, ''))) < 2 then
    raise exception 'Bedrijfsnaam is verplicht' using errcode = '22023';
  end if;

  if v_effective_vat_status is null or v_effective_vat_status in ('vat_liable','kor') then
    if v_kvk is null or v_kvk !~ '^[0-9]{8}$' then
      raise exception 'KvK-nummer moet uit 8 cijfers bestaan' using errcode = '22023';
    end if;
  elsif v_kvk is not null and v_kvk !~ '^[0-9]{8}$' then
    raise exception 'KvK-nummer moet uit 8 cijfers bestaan' using errcode = '22023';
  end if;

  if v_effective_vat_status is null or v_effective_vat_status = 'vat_liable' then
    if v_btw is null or v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' then
      raise exception 'BTW-nummer heeft geen geldig formaat' using errcode = '22023';
    end if;
  elsif v_btw is not null and v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' then
    raise exception 'BTW-nummer heeft geen geldig formaat' using errcode = '22023';
  end if;

  if length(v_contact_first_name) < 2
    or length(v_contact_last_name) < 2
    or position('@' in v_contact_email) <= 1
    or v_contact_country_code <> '+31'
    or v_contact_phone_digits !~ '^[1-9][0-9]{8}$'
  then
    raise exception 'Controleer de contactpersoon gegevens' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_billing_address_street, ''))) < 3
    or v_billing_postal !~ '^[1-9][0-9]{3}[A-Z]{2}$'
    or length(trim(coalesce(p_billing_address_city, ''))) < 2
  then
    raise exception 'Controleer het factuuradres' using errcode = '22023';
  end if;

  if position('@' in v_invoice_email) <= 1 then
    raise exception 'Factuurmail heeft geen geldig formaat' using errcode = '22023';
  end if;

  select d.payout_iban into v_existing_iban
  from public.client_payment_details d where d.client_id = v_client_id;

  update public.clients
  set
    company_name = trim(p_company_name),
    kvk = v_kvk,
    btw_number = v_btw,
    contact_name = v_contact_first_name || ' ' || v_contact_last_name,
    contact_email = v_contact_email,
    contact_phone = v_contact_country_code || v_contact_phone_digits,
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = v_billing_postal,
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', ' || v_billing_postal || ' ' || trim(p_billing_address_city),
    calculate_ere_enabled = coalesce(p_calculate_ere_enabled, false),
    vat_status = coalesce(v_vat_status, vat_status),
    vat_status_confirmed_at = case when v_vat_status is not null and v_vat_status is distinct from vat_status then null else vat_status_confirmed_at end,
    vat_status_confirmed_by = case when v_vat_status is not null and v_vat_status is distinct from vat_status then null else vat_status_confirmed_by end,
    payment_onboarding_status = case when v_existing_iban is null then 'missing' else payment_onboarding_status end
  where id = v_client_id;

  insert into public.client_payment_details (client_id, invoice_email, account_holder_confirmed, status, submitted_at, updated_at)
  values (v_client_id, v_invoice_email, false, 'missing', v_now, v_now)
  on conflict (client_id) do update
  set
    invoice_email = excluded.invoice_email,
    status = case when public.client_payment_details.payout_iban is null then 'missing' else public.client_payment_details.status end,
    updated_at = v_now;

  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (
    v_client_id, auth.uid(),
    'client_company_details_saved',
    'Klant heeft bedrijfs-, contact- en factuurgegevens opgeslagen',
    jsonb_build_object(
      'invoice_email', v_invoice_email, 'contact_email', v_contact_email,
      'btw_number', v_btw, 'vat_status', v_vat_status,
      'calculate_ere_enabled', coalesce(p_calculate_ere_enabled, false)
    )
  );
end;
$function$;

do $$ begin
  revoke all on function public.update_portal_company_details(text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) from public;
  grant execute on function public.update_portal_company_details(text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) to authenticated, service_role;
  revoke all on function public.get_portal_sessions(timestamptz,timestamptz,uuid,uuid,integer) from public;
  grant execute on function public.get_portal_sessions(timestamptz,timestamptz,uuid,uuid,integer) to authenticated, service_role;
  grant execute on function public.get_portal_dashboard_kpis() to authenticated, service_role;
  grant execute on function public.get_portal_payment_details() to authenticated, service_role;
  grant execute on function public.get_portal_invoice_context() to authenticated, service_role;
end $$;
