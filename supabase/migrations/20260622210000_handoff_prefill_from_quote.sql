-- Installateur-handoff vooraf vullen vanuit de offerte/locatie. Het installatie-order wordt bij
-- aanmaak al gevuld (adres, contact, service-samenvatting, opdrachtomschrijving) zodat doorzetten naar
-- de installateur in één klik kan. Gedeelde helper fill_installation_order_site vult ALLEEN lege velden
-- (overschrijft handmatige aanpassingen nooit) en wordt door zowel de RPC als de backfill gebruikt.

-- Straat + huisnummer splitsen (zelfde logica als splitDutchAddress in installationHandoff.ts).
create or replace function app_private.split_dutch_address(p_addr text)
returns table(street text, house text)
language sql immutable
as $$
  select
    btrim(regexp_replace(coalesce(p_addr, ''), '\s*\d+[A-Za-z]?([-/]\d+[A-Za-z]?)?\s*$', '')),
    (regexp_match(coalesce(p_addr, ''), '(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s*$'))[1];
$$;

-- Vult de lege site-/samenvatting-/notitievelden van één order uit zijn offerte/project-locatie/lead/klant.
create or replace function app_private.fill_installation_order_site(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  o public.installation_orders%rowtype;
  q public.quotes%rowtype; l public.leads%rowtype; c public.clients%rowtype;
  v_od jsonb; v_pl_street text; v_pl_house text; v_pl_postal text; v_pl_city text;
  v_street text; v_house text; v_postal text; v_city text; v_addr text; v_split record;
  v_summary text; v_notes text; v_scope text; v_ncp int; v_charger text;
begin
  select * into o from public.installation_orders where id = p_order_id;
  if not found or o.quote_id is null then return; end if;
  select * into q from public.quotes where id = o.quote_id;
  if o.lead_id is not null then select * into l from public.leads where id = o.lead_id; end if;
  if o.client_id is not null then select * into c from public.clients where id = o.client_id; end if;

  v_od := coalesce(q.offer_details, '{}'::jsonb);
  v_ncp := q.num_charge_points;
  v_charger := nullif(btrim(v_od->>'chargerModel'), '');
  v_scope := nullif(btrim(v_od->>'leveringText'), '');

  if q.project_location_id is not null then
    select address_street, house_number, postal_code, city
      into v_pl_street, v_pl_house, v_pl_postal, v_pl_city
    from public.project_locations where id = q.project_location_id;
  end if;

  if v_pl_street is not null or v_pl_postal is not null or v_pl_city is not null then
    v_street := v_pl_street; v_house := v_pl_house; v_postal := v_pl_postal; v_city := v_pl_city;
  else
    v_street := coalesce(nullif(btrim(v_od->>'addressStreet'), ''), l.address_street, c.billing_address_street);
    v_postal := coalesce(nullif(btrim(v_od->>'addressPostalCode'), ''), l.postal_code, c.billing_address_postal);
    v_city   := coalesce(nullif(btrim(v_od->>'addressCity'), ''), l.city, c.billing_address_city);
  end if;
  if v_house is null and v_street is not null then
    select street, house into v_split from app_private.split_dutch_address(v_street);
    v_street := coalesce(nullif(v_split.street, ''), v_street); v_house := v_split.house;
  end if;

  if v_ncp is not null then
    v_summary := v_ncp || ' laadpunt' || case when v_ncp = 1 then '' else 'en' end;
    if v_charger is not null then v_summary := v_summary || ' — ' || v_charger; end if;
  end if;

  v_notes := nullif(concat_ws(E'\n\n',
    nullif(btrim(coalesce(v_od->>'object', v_od->>'betreft')), ''),
    v_scope,
    case when q.with_management is distinct from false then 'Inclusief E-Charging beheer.'
         else 'Zonder beheer (alleen levering & installatie).' end), '');

  update public.installation_orders set
    site_street        = coalesce(nullif(btrim(site_street), ''), v_street),
    site_house_number  = coalesce(nullif(btrim(site_house_number), ''), v_house),
    site_postal        = coalesce(nullif(btrim(site_postal), ''), v_postal),
    site_city          = coalesce(nullif(btrim(site_city), ''), v_city),
    site_contact_name  = coalesce(nullif(btrim(site_contact_name), ''), c.contact_name, q.prospect_contact, l.contact_name),
    site_contact_email = coalesce(nullif(btrim(site_contact_email), ''), c.contact_email, q.prospect_email, l.contact_email),
    site_contact_phone = coalesce(nullif(btrim(site_contact_phone), ''), c.contact_phone, l.contact_phone),
    service_summary    = coalesce(nullif(btrim(service_summary), ''), v_summary),
    notes              = coalesce(nullif(btrim(notes), ''), v_notes),
    updated_at = now()
  where id = p_order_id;
end;
$$;
revoke all on function app_private.fill_installation_order_site(uuid) from public, anon, authenticated;

-- RPC: installatie-order minimaal aanmaken en daarna via de helper vullen (i.p.v. een generieke notitie).
create or replace function public.create_client_from_quote(
  p_quote_id uuid, p_reviewed jsonb default '{}'::jsonb, p_target_client_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private'
as $$
declare
  q public.quotes%rowtype; l public.leads%rowtype;
  v_org uuid; v_company uuid; v_person uuid; v_client uuid; v_client_number integer; v_order_id uuid;
  v_name text; v_first text; v_last text; v_snap jsonb; v_maxv int;
  f_company_name text; f_kvk text; f_btw text; f_contact_name text; f_contact_email text;
  f_contact_phone text; f_street text; f_postal text; f_city text; f_duration int; f_notice int; f_managed boolean;
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
  f_company_name := coalesce(nullif(btrim(p_reviewed->>'company_name'), ''), q.prospect_company, l.company_name, 'Onbekend bedrijf');
  f_kvk          := coalesce(nullif(btrim(p_reviewed->>'kvk'), ''), l.kvk);
  f_btw          := nullif(btrim(p_reviewed->>'btw_number'), '');
  f_contact_name := coalesce(nullif(btrim(p_reviewed->>'contact_name'), ''), q.prospect_contact, l.contact_name);
  f_contact_email:= coalesce(nullif(btrim(p_reviewed->>'contact_email'), ''), q.prospect_email, l.contact_email);
  f_contact_phone:= coalesce(nullif(btrim(p_reviewed->>'contact_phone'), ''), l.contact_phone);
  f_street       := coalesce(nullif(btrim(p_reviewed->>'billing_address_street'), ''), l.address_street);
  f_postal       := coalesce(nullif(btrim(p_reviewed->>'billing_address_postal'), ''), l.postal_code);
  f_city         := coalesce(nullif(btrim(p_reviewed->>'billing_address_city'), ''), l.city);
  f_duration     := nullif(btrim(p_reviewed->>'contract_duration_months'), '')::int;
  f_notice       := nullif(btrim(p_reviewed->>'notice_period_months'), '')::int;
  f_managed      := case when p_reviewed ? 'managed' then (p_reviewed->>'managed')::boolean else (q.with_management is distinct from false) end;
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
        email = coalesce(f_contact_email, email), phone = coalesce(f_contact_phone, phone)
      where id = v_person;
    exception when unique_violation then null; end;
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
        billing_address_city=f_city, contract_duration_months=coalesce(f_duration, contract_duration_months),
        notice_period_months=coalesce(f_notice, notice_period_months), managed=f_managed, status='actief'
      where id = v_client;
    end if;
  end if;
  if v_client is null then
    insert into public.clients (organization_id, company_id, person_id, company_name, kvk, btw_number, contact_name,
      contact_email, contact_phone, billing_address_street, billing_address_postal, billing_address_city,
      contract_duration_months, notice_period_months, managed, status, notes)
    values (v_org, v_company, v_person, f_company_name, f_kvk, f_btw, f_contact_name, f_contact_email, f_contact_phone,
      f_street, f_postal, f_city, coalesce(f_duration, 12), coalesce(f_notice, 3), f_managed, 'actief', 'Aangemaakt via offerte ' || coalesce(q.quote_number, ''))
    returning id into v_client;
  end if;
  if v_snap ? 'pricing_input' and v_snap ? 'pricing_result' then
    select coalesce(max(version), 0) into v_maxv from public.customer_configurations where client_id = v_client;
    insert into public.customer_configurations (client_id, organization_id, version, settings_version, pricing_input, pricing_result, status)
    values (v_client, v_org, v_maxv + 1, coalesce(nullif(v_snap->>'settings_version', '')::int, 1), v_snap->'pricing_input', v_snap->'pricing_result', 'agreed');
  end if;
  -- Installatie-order minimaal aanmaken; daarna vullen uit de offerte/locatie (adres/contact/scope).
  if not exists (select 1 from public.installation_orders where quote_id = q.id) then
    insert into public.installation_orders (organization_id, client_id, quote_id, lead_id, company_id, status)
    values (v_org, v_client, q.id, q.lead_id, v_company, 'nieuw')
    returning id into v_order_id;
    perform app_private.fill_installation_order_site(v_order_id);
  end if;
  if q.project_location_id is not null and q.with_management is distinct from false then
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
$$;

-- Backfill: vul bestaande orders met lege velden (incl. al aangemaakte klanten).
select app_private.fill_installation_order_site(id)
from public.installation_orders
where coalesce(btrim(site_street), '') = '' or coalesce(btrim(service_summary), '') = '' or coalesce(btrim(notes), '') = '';
