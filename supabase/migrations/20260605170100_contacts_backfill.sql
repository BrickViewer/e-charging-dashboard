-- ============================================================================
-- Backfill: bestaande clients → leads → quotes consolideren tot deduped
-- companies/persons. Idempotent: verwerkt alleen rijen zonder company_id.
-- ============================================================================

-- Naam-splitser (laatste spatie scheidt voor-/achternaam).
create or replace function app_private.split_person_name(p_name text)
returns table(first_name text, last_name text)
language plpgsql immutable as $$
declare v text; v_pos int;
begin
  v := btrim(coalesce(p_name, ''));
  if v = '' then first_name := null; last_name := null; return next; return; end if;
  if position(' ' in v) = 0 then first_name := v; last_name := null; return next; return; end if;
  v_pos := length(v) - position(' ' in reverse(v)) + 1; -- 1-based positie laatste spatie
  first_name := btrim(left(v, v_pos - 1));
  last_name := btrim(substr(v, v_pos + 1));
  return next;
end $$;

-- Resolve-or-create company op (org, normalized_name).
create or replace function app_private.resolve_company(
  p_org uuid, p_name text, p_kvk text, p_btw text, p_website text, p_sector text,
  p_street text, p_postal text, p_city text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then return null; end if;
  select id into v_id from public.companies
    where organization_id = p_org and normalized_name = lower(btrim(p_name)) limit 1;
  if v_id is null then
    insert into public.companies (organization_id, name, kvk, btw_number, website, sector, address_street, postal_code, city)
    values (p_org, btrim(p_name), nullif(p_kvk,''), nullif(p_btw,''), nullif(p_website,''), nullif(p_sector,''),
            nullif(p_street,''), nullif(p_postal,''), nullif(p_city,''))
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Resolve-or-create person op email (fallback full_name).
create or replace function app_private.resolve_person(
  p_org uuid, p_name text, p_email text, p_phone text, p_role text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_first text; v_last text;
begin
  if (p_name is null or btrim(p_name) = '') and (p_email is null or btrim(p_email) = '') then return null; end if;
  if p_email is not null and btrim(p_email) <> '' then
    select id into v_id from public.persons where organization_id = p_org and lower(email) = lower(btrim(p_email)) limit 1;
  end if;
  if v_id is null and p_name is not null and btrim(p_name) <> '' then
    select id into v_id from public.persons
      where organization_id = p_org and lower(full_name) = lower(btrim(p_name))
        and (email is null or p_email is null or btrim(p_email) = '') limit 1;
  end if;
  if v_id is null then
    select s.first_name, s.last_name into v_first, v_last from app_private.split_person_name(p_name) s;
    insert into public.persons (organization_id, first_name, last_name, email, phone, role)
    values (p_org, v_first, v_last, nullif(btrim(p_email),''), nullif(p_phone,''), nullif(p_role,''))
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- 1) CLIENTS
do $$
declare r record; v_company uuid; v_person uuid;
begin
  for r in select * from public.clients where company_id is null and company_name is not null and btrim(company_name) <> '' loop
    v_company := app_private.resolve_company(r.organization_id, r.company_name, r.kvk, r.btw_number, null, null,
                   r.billing_address_street, r.billing_address_postal, r.billing_address_city);
    v_person  := app_private.resolve_person(r.organization_id, r.contact_name, r.contact_email, r.contact_phone, null);
    if v_company is not null and v_person is not null then
      insert into public.company_persons (company_id, person_id, is_primary)
      values (v_company, v_person, true) on conflict (company_id, person_id) do nothing;
    end if;
    update public.clients set company_id = v_company, person_id = v_person where id = r.id;
  end loop;
end $$;

-- 2) LEADS (geconverteerde leads hergebruiken de company/person van hun client)
do $$
declare r record; v_company uuid; v_person uuid;
begin
  for r in select * from public.leads where company_id is null and company_name is not null and btrim(company_name) <> '' loop
    v_company := null; v_person := null;
    if r.converted_client_id is not null then
      select company_id, person_id into v_company, v_person from public.clients where id = r.converted_client_id;
    end if;
    if v_company is null then
      v_company := app_private.resolve_company(r.organization_id, r.company_name, r.kvk, null, r.website, r.sector,
                     r.address_street, r.postal_code, r.city);
    end if;
    if v_person is null then
      v_person := app_private.resolve_person(r.organization_id, r.contact_name, r.contact_email, r.contact_phone, r.contact_role);
    end if;
    if v_company is not null and v_person is not null then
      insert into public.company_persons (company_id, person_id, is_primary)
      values (v_company, v_person, true) on conflict (company_id, person_id) do nothing;
    end if;
    update public.leads set company_id = v_company, person_id = v_person where id = r.id;
  end loop;
end $$;

-- 3) QUOTES (gekoppeld aan client → hergebruik die company/person)
do $$
declare r record; v_company uuid; v_person uuid;
begin
  for r in select * from public.quotes where company_id is null loop
    v_company := null; v_person := null;
    if r.client_id is not null then
      select company_id, person_id into v_company, v_person from public.clients where id = r.client_id;
    end if;
    if v_company is null and r.prospect_company is not null and btrim(r.prospect_company) <> '' then
      v_company := app_private.resolve_company(r.organization_id, r.prospect_company, null, null, null, null, null, null, null);
    end if;
    if v_person is null then
      v_person := app_private.resolve_person(r.organization_id, r.prospect_contact, r.prospect_email, null, null);
    end if;
    if v_company is not null and v_person is not null then
      insert into public.company_persons (company_id, person_id, is_primary)
      values (v_company, v_person, true) on conflict (company_id, person_id) do nothing;
    end if;
    if v_company is not null or v_person is not null then
      update public.quotes set company_id = v_company, person_id = v_person where id = r.id;
    end if;
  end loop;
end $$;
