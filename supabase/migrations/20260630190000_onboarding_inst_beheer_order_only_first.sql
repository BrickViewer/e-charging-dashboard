-- Installatie + beheer wordt nu OOK order-only gestart (order naar installateur zonder klantaccount);
-- het klantaccount wordt pas na oplevering aangemaakt en de bestaande order wordt eraan gekoppeld.
-- 1) create_order_from_quote: clientloze order voor ELKE installatie-scope (niet alleen 'alleen installatie').
-- 2) create_client_from_quote: koppel een bestaande clientloze order aan de nieuwe klant.

create or replace function public.create_order_from_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  q public.quotes%rowtype;
  l public.leads%rowtype;
  v_company uuid;
  v_order uuid;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then return null; end if;
  -- Elke installatie-scope (alleen-installatie EN installatie+beheer) -> order-only naar de installateur.
  -- Alleen-beheer (geen installatie) krijgt geen order (loopt via klant-aanmaken).
  if not coalesce(q.with_installation, true) then
    return null;
  end if;
  -- Idempotent: nooit dubbel.
  select id into v_order from public.installation_orders where quote_id = q.id limit 1;
  if v_order is not null then return v_order; end if;
  if q.lead_id is not null then select * into l from public.leads where id = q.lead_id; end if;
  v_company := coalesce(q.company_id, l.company_id);
  insert into public.installation_orders (organization_id, client_id, quote_id, lead_id, company_id, status, notes)
  values (q.organization_id, null, q.id, q.lead_id, v_company, 'nieuw',
          'Alleen-installatie order vanuit getekende offerte ' || coalesce(q.quote_number, ''))
  returning id into v_order;
  return v_order;
end;
$$;

create or replace function public.create_client_from_quote(p_quote_id uuid, p_reviewed jsonb DEFAULT '{}'::jsonb, p_target_client_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'app_private'
as $function$
declare
  q public.quotes%rowtype;
  l public.leads%rowtype;
  v_co public.companies%rowtype;
  v_org uuid; v_company uuid; v_person uuid; v_client uuid; v_client_number integer;
  v_name text; v_first text; v_last text; v_snap jsonb; v_maxv int;
  f_company_name text; f_kvk text; f_btw text; f_contact_name text; f_contact_email text;
  f_contact_phone text; f_street text; f_postal text; f_city text; f_duration int; f_notice int; f_managed boolean;
  f_needs_install boolean; f_vat_status text;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'Offerte niet gevonden' using errcode = 'P0002'; end if;
  if q.status <> 'getekend' then raise exception 'Alleen getekende offertes kunnen een klantaccount krijgen'; end if;

  if q.client_id is not null then
    select client_number into v_client_number from public.clients where id = q.client_id;
    return jsonb_build_object('clientId', q.client_id, 'clientNumber', v_client_number);
  end if;

  v_org := q.organization_id;
  if q.lead_id is not null then select * into l from public.leads where id = q.lead_id; end if;
  v_company := coalesce(q.company_id, l.company_id);
  v_person  := coalesce(q.person_id, l.person_id);
  v_snap    := q.calculation_snapshot;
  if v_company is not null then select * into v_co from public.companies where id = v_company; end if;

  -- Particulier: geen bedrijf -> naam = contactpersoon (i.p.v. 'Onbekend bedrijf').
  f_company_name := coalesce(nullif(btrim(p_reviewed->>'company_name'), ''), v_co.name, q.prospect_company, l.company_name, q.prospect_contact, l.contact_name, 'Onbekend bedrijf');
  f_kvk          := coalesce(nullif(btrim(p_reviewed->>'kvk'), ''), v_co.kvk, l.kvk);
  f_btw          := coalesce(nullif(btrim(p_reviewed->>'btw_number'), ''), v_co.btw_number);
  f_contact_name := coalesce(nullif(btrim(p_reviewed->>'contact_name'), ''), q.prospect_contact, l.contact_name);
  f_contact_email:= coalesce(nullif(btrim(p_reviewed->>'contact_email'), ''), q.prospect_email, l.contact_email);
  f_contact_phone:= coalesce(nullif(btrim(p_reviewed->>'contact_phone'), ''), l.contact_phone);
  f_street       := coalesce(nullif(btrim(p_reviewed->>'billing_address_street'), ''), l.address_street, v_co.address_street);
  f_postal       := coalesce(nullif(btrim(p_reviewed->>'billing_address_postal'), ''), l.postal_code, v_co.postal_code);
  f_city         := coalesce(nullif(btrim(p_reviewed->>'billing_address_city'), ''), l.city, v_co.city);
  f_duration     := nullif(btrim(p_reviewed->>'contract_duration_months'), '')::int;
  f_notice       := nullif(btrim(p_reviewed->>'notice_period_months'), '')::int;
  f_managed      := case when p_reviewed ? 'managed' then (p_reviewed->>'managed')::boolean else (q.with_management is distinct from false) end;
  f_needs_install:= case when p_reviewed ? 'needs_installation' then (p_reviewed->>'needs_installation')::boolean else (q.with_installation is distinct from false) end;
  -- Geen bedrijf -> particulier -> vat_status 'private' (alleen bij nieuwe client).
  f_vat_status   := case when v_company is null then 'private' else null end;

  if v_person is not null and (f_contact_name is not null or f_contact_email is not null or f_contact_phone is not null) then
    if f_contact_name is not null then
      v_name := btrim(f_contact_name);
      if v_name ~ '\s' then v_first := btrim(regexp_replace(v_name, '\s+\S+$', '')); v_last := regexp_replace(v_name, '^.*\s+', '');
      else v_first := v_name; v_last := ''; end if;
    end if;
    begin
      update public.persons set
        first_name = case when f_contact_name is not null then v_first else first_name end,
        last_name  = case when f_contact_name is not null then v_last  else last_name  end,
        email = coalesce(f_contact_email, email),
        phone = coalesce(f_contact_phone, phone)
      where id = v_person;
    exception when unique_violation then null;
    end;
  end if;
  if v_company is not null then
    update public.companies set
      name = coalesce(f_company_name, name), kvk = coalesce(f_kvk, kvk), btw_number = coalesce(f_btw, btw_number),
      address_street = coalesce(f_street, address_street), postal_code = coalesce(f_postal, postal_code), city = coalesce(f_city, city)
    where id = v_company;
  end if;

  if p_target_client_id is not null then
    select id into v_client from public.clients where organization_id = v_org and id = p_target_client_id and status <> 'verwijderd';
    if v_client is null then raise exception 'Gekozen klantaccount niet gevonden'; end if;
  elsif v_company is not null then
    select id into v_client from public.clients where organization_id = v_org and company_id = v_company and status <> 'verwijderd'
      order by created_at asc limit 1;
    if v_client is not null then
      update public.clients set
        company_name=f_company_name, kvk=f_kvk, btw_number=f_btw, contact_name=f_contact_name, contact_email=f_contact_email,
        contact_phone=f_contact_phone, billing_address_street=f_street, billing_address_postal=f_postal,
        billing_address_city=f_city,
        contract_duration_months=coalesce(f_duration, contract_duration_months),
        notice_period_months=coalesce(f_notice, notice_period_months),
        managed=f_managed, needs_installation=f_needs_install, status='actief'
      where id = v_client;
    end if;
  end if;
  if v_client is null then
    insert into public.clients (organization_id, company_id, person_id, company_name, kvk, btw_number, contact_name,
      contact_email, contact_phone, billing_address_street, billing_address_postal, billing_address_city,
      contract_duration_months, notice_period_months, managed, needs_installation, vat_status, status, notes)
    values (v_org, v_company, v_person, f_company_name, f_kvk, f_btw, f_contact_name, f_contact_email, f_contact_phone,
      f_street, f_postal, f_city, coalesce(f_duration, 12), coalesce(f_notice, 3), f_managed, f_needs_install, f_vat_status, 'actief', 'Aangemaakt via offerte ' || coalesce(q.quote_number, ''))
    returning id into v_client;
  end if;

  if v_snap ? 'pricing_input' and v_snap ? 'pricing_result' then
    select coalesce(max(version), 0) into v_maxv from public.customer_configurations where client_id = v_client;
    insert into public.customer_configurations (client_id, organization_id, version, settings_version, pricing_input, pricing_result, status)
    values (v_client, v_org, v_maxv + 1, coalesce(nullif(v_snap->>'settings_version', '')::int, 1), v_snap->'pricing_input', v_snap->'pricing_result', 'agreed');
  end if;

  -- Installatie-scope: koppel een bestaande clientloze order (order-only pad) aan de nieuwe klant,
  -- of maak er een aan als die nog niet bestaat. (Alleen-beheer -> geen installatie -> geen order.)
  if f_needs_install then
    update public.installation_orders set client_id = v_client
      where quote_id = q.id and client_id is null;
    if not exists (select 1 from public.installation_orders where quote_id = q.id) then
      insert into public.installation_orders (organization_id, client_id, quote_id, lead_id, company_id, status, notes)
      values (v_org, v_client, q.id, q.lead_id, v_company, 'nieuw', 'Vanuit getekende offerte ' || coalesce(q.quote_number, ''));
    end if;
  end if;

  if q.project_location_id is not null then
    update public.project_locations set client_id = v_client where id = q.project_location_id;
  end if;

  update public.quotes set client_id = v_client where id = q.id;
  if q.lead_id is not null then
    update public.leads set converted_client_id = coalesce(converted_client_id, v_client) where id = q.lead_id;
  end if;

  insert into public.activity_log (organization_id, client_id, action, details)
  values (v_org, v_client, 'client_created_from_quote', jsonb_build_object('quote_id', q.id, 'quote_number', q.quote_number));

  select client_number into v_client_number from public.clients where id = v_client;
  return jsonb_build_object('clientId', v_client, 'clientNumber', v_client_number);
end;
$function$;
