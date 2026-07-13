-- ============================================================================
-- E-PORTAL GAP-MIGRATIE (uitvoerbaar, idempotent) — 2026-07-13
-- Trekt een e-portal-omgeving gelijk met productie voor de e-charging-
-- integratie. Bron: de live productie-definities (natxaneygihzzszabmcv).
-- Toegepast op e-portal-dev (ybucrltqwhiassmdqrww) via MCP; neem dit bestand
-- ook op in de e-portal-repo-migraties zodat repo/dev/prod synchroon blijven.
-- Vereist dat de basis er al staat (orders.external_*, order_materials,
-- order_lines.estimated_hours, work_order_materials.position, allowlist-fn).
-- ============================================================================

-- 1) Vault-secret-lezer voor edge functions (service-role-only).
create or replace function public.get_integration_secret(p_name text)
returns text
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function public.get_integration_secret(text) from public;
revoke all on function public.get_integration_secret(text) from anon, authenticated;
grant execute on function public.get_integration_secret(text) to service_role;

-- 2) Atomaire full-state replace van de materialenlijst (Contract 3 v2).
create or replace function public.sync_external_order_materials(p_order_id uuid, p_materials jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
begin
  perform 1 from orders where id = p_order_id for update;
  delete from order_materials where order_id = p_order_id;
  insert into order_materials (order_id, position, quantity, unit, article_number, description, supplier, status)
  select p_order_id,
         coalesce(nullif(m->>'position','')::int, 0),
         coalesce(nullif(m->>'qty','')::numeric, 1),
         nullif(m->>'unit',''),
         nullif(m->>'article_number',''),
         m->>'description',
         nullif(m->>'supplier',''),
         case when m->>'status' in ('niet_nodig','te_bestellen','besteld','binnen')
              then m->>'status' else 'te_bestellen' end
  from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) m
  where coalesce(m->>'description','') <> '';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.sync_external_order_materials(uuid, jsonb) from public;
revoke all on function public.sync_external_order_materials(uuid, jsonb) from anon, authenticated;

-- 3) Plandatum-terugkoppeling: meldt 'ingepland' + vroegste datum aan de
--    external_callback_url zodra een e-charging-opdracht een plandatum krijgt.
create or replace function public.notify_echarging_scheduled()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_order record;
  v_secret text;
  v_date date;
begin
  if new.scheduled_date is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.scheduled_date is not distinct from old.scheduled_date then
    return new;
  end if;

  select o.id, o.order_number, o.external_reference, o.external_callback_url
  into v_order
  from public.orders o
  where o.id = new.order_id and o.external_system = 'e-charging';
  if v_order.id is null or v_order.external_callback_url is null then
    return new;
  end if;

  if not public.is_allowed_callback_url(v_order.external_callback_url) then
    raise warning 'scheduled-callback overgeslagen, host niet toegestaan: %', v_order.external_callback_url;
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'echarging_webhook_secret' limit 1;
  if v_secret is null then
    return new;
  end if;

  select coalesce(
    (select min(w.scheduled_date) from public.work_orders w where w.order_id = v_order.id),
    (select min(l.scheduled_date) from public.order_lines l where l.order_id = v_order.id)
  ) into v_date;
  if v_date is null then
    return new;
  end if;

  perform net.http_post(
    url := v_order.external_callback_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-echarging-secret', v_secret
    ),
    body := jsonb_build_object(
      'external_reference', v_order.external_reference,
      'egroup_order_id', v_order.id,
      'egroup_order_number', v_order.order_number,
      'status', 'ingepland',
      'scheduled_date', v_date
    )
  );

  return new;
exception when others then
  raise warning 'notify_echarging_scheduled faalde: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_echarging_scheduled_wo on public.work_orders;
create trigger trg_echarging_scheduled_wo
  after insert or update of scheduled_date on public.work_orders
  for each row execute function public.notify_echarging_scheduled();

drop trigger if exists trg_echarging_scheduled_ol on public.order_lines;
create trigger trg_echarging_scheduled_ol
  after insert or update of scheduled_date on public.order_lines
  for each row execute function public.notify_echarging_scheduled();

-- 4) create_external_order v2: estimated_hours uit de e-charging-calculatie op
--    de order_line (defensief geparsed; <= 0 wordt null).
create or replace function public.create_external_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_external_reference text := p_payload->>'external_reference';
  v_external_system text := coalesce(nullif(p_payload->>'external_system',''), 'e-charging');
  v_service_category service_category;
  v_customer jsonb := coalesce(p_payload->'customer', '{}'::jsonb);
  v_site jsonb := coalesce(p_payload->'site', '{}'::jsonb);
  v_contact jsonb := coalesce(p_payload->'contact', '{}'::jsonb);
  v_site_contact jsonb := coalesce(p_payload->'site_contact', '{}'::jsonb);
  v_totals jsonb := coalesce(p_payload->'totals', '{}'::jsonb);
  v_existing_id uuid;
  v_existing_number text;
  v_order_number text;
  v_order_id uuid;
  v_material numeric := coalesce((v_totals->>'hardware_cost')::numeric, 0);
  v_labor numeric := coalesce((v_totals->>'installation_cost')::numeric, 0);
  v_description text;
  v_line jsonb;
  v_hours numeric;
begin
  if v_external_reference is null or v_external_reference = '' then
    raise exception 'external_reference vereist';
  end if;
  if coalesce(v_customer->>'name','') = '' then
    raise exception 'customer.name vereist';
  end if;
  if coalesce(v_site->>'street','') = '' or coalesce(v_site->>'house_number','') = ''
     or coalesce(v_site->>'postal_code','') = '' or coalesce(v_site->>'city','') = '' then
    raise exception 'site adres incompleet (street/house_number/postal_code/city)';
  end if;

  -- SSRF-hardening: opgegeven callback_url moet https zijn en op de allowlist staan.
  if nullif(p_payload->>'callback_url','') is not null
     and not public.is_allowed_callback_url(p_payload->>'callback_url') then
    raise exception 'callback_url host niet toegestaan: %', p_payload->>'callback_url';
  end if;

  begin
    v_service_category := (p_payload->>'service_category')::service_category;
  exception when others then
    v_service_category := 'e_charging'::service_category;
  end;
  if v_service_category is null then
    v_service_category := 'e_charging'::service_category;
  end if;

  select id, order_number into v_existing_id, v_existing_number
  from orders where external_reference = v_external_reference limit 1;
  if v_existing_id is not null then
    return jsonb_build_object('order_id', v_existing_id, 'order_number', v_existing_number, 'idempotent', true);
  end if;

  v_order_number := get_next_number('order');
  v_description := coalesce(nullif(p_payload->>'service_summary',''), nullif(p_payload->>'notes',''),
                           'Opdracht vanuit ' || v_external_system);

  insert into orders (order_number, project_id, opdrachtgever_id, status, service_category, source,
    external_reference, external_system, external_callback_url, description, notes,
    material_cost, labor_cost, total_amount)
  values (v_order_number, null, null, 'bevestigd', v_service_category, 'e_charging_dashboard',
    v_external_reference, v_external_system, nullif(p_payload->>'callback_url',''), v_description, nullif(nullif(p_payload->>'notes',''), v_description),
    v_material, v_labor, v_material + v_labor)
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'order_lines','[]'::jsonb))
  loop
    if coalesce(v_line->>'description','') <> '' then
      begin
        v_hours := nullif(v_line->>'estimated_hours','')::numeric;
      exception when others then
        v_hours := null;
      end;
      if v_hours is not null and v_hours <= 0 then v_hours := null; end if;
      insert into order_lines (order_id, project_id, service_type, work_description, status, estimated_hours)
      values (v_order_id, null, v_service_category, v_line->>'description', 'open', v_hours);
    end if;
  end loop;

  insert into external_order_mirrors (order_id, external_system, external_reference,
    customer_name, customer_organization_type, customer_kvk_number, customer_vat_number, customer_email, customer_phone,
    customer_street, customer_house_number, customer_postal_code, customer_city, customer_country,
    contact_name, contact_email, contact_phone,
    site_contact_name, site_contact_email, site_contact_phone,
    install_street, install_house_number, install_postal_code, install_city, install_country, install_location_name,
    raw_payload)
  values (v_order_id, v_external_system, v_external_reference,
    v_customer->>'name',
    case when v_customer->>'organization_type' = 'particulier' then 'particulier' else 'bedrijf' end,
    nullif(v_customer->>'kvk_number',''), nullif(v_customer->>'vat_number',''), nullif(v_customer->>'email',''), nullif(v_customer->>'phone',''),
    nullif(v_customer->>'street',''), nullif(v_customer->>'house_number',''), nullif(v_customer->>'postal_code',''), nullif(v_customer->>'city',''), coalesce(nullif(v_customer->>'country',''),'Nederland'),
    nullif(v_contact->>'name',''), nullif(v_contact->>'email',''), nullif(v_contact->>'phone',''),
    nullif(v_site_contact->>'name',''), nullif(v_site_contact->>'email',''), nullif(v_site_contact->>'phone',''),
    v_site->>'street', nullif(v_site->>'house_number',''), nullif(v_site->>'postal_code',''), nullif(v_site->>'city',''), coalesce(nullif(v_site->>'country',''),'Nederland'),
    coalesce(nullif(v_site->>'location_name',''), v_customer->>'name'),
    p_payload);

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$$;
