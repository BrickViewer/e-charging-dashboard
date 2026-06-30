-- Doorsturen-scherm: adres (uit project_location) + opdrachtomschrijving (offerte-leveringText) moeten
-- automatisch op de installatie-order staan. De helper fill_installation_order_site deed dit al, maar werd
-- niet meer aangeroepen bij het aanmaken van orders. We zetten een AFTER INSERT-trigger zodat élke nieuwe
-- order (order-only én beheer) automatisch correct gevuld wordt. Daarnaast vullen we service_summary niet
-- meer automatisch -> dat veld wordt het vrije 'Notities'-veld in het scherm.

-- 1) Helper: service_summary niet meer auto-vullen (rest ongewijzigd).
create or replace function app_private.fill_installation_order_site(p_order_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private' as $$
declare
  o public.installation_orders%rowtype; q public.quotes%rowtype; l public.leads%rowtype; c public.clients%rowtype;
  v_od jsonb; v_pl_street text; v_pl_house text; v_pl_postal text; v_pl_city text;
  v_street text; v_house text; v_postal text; v_city text; v_split record;
  v_notes text;
  -- HOUD IN SYNC met DEFAULT_LEVERING_TEXT in apps/admin/src/services/offerTemplate.ts.
  v_default_levering constant text := concat_ws(E'\n\n',
    'Het leveren, monteren en aansluiten van 10 stuks Zaptec Go 2 Asphalt Black gemonteerd op 5 stuks nieuwe laadpalen.',
    'T.b.v. de load balancing wordt er in de meterkast Zaptec Sense geplaatst. Deze Sense regelt het vermogen wat voor de laadpaal beschikbaar wordt gesteld t.o.v. het totaal afgenomen vermogen van de aansluiting. Tevens kan hiermee ook bij een dynamisch energiecontract op de voordeligste momenten van de dag worden geladen. Ook met opgewekte zonne-energie kan geladen worden.',
    'Meterkast wordt uitgebreid met 5 eindgroepen van 32A.');
begin
  select * into o from public.installation_orders where id = p_order_id;
  if not found or o.quote_id is null then return; end if;
  select * into q from public.quotes where id = o.quote_id;
  if o.lead_id is not null then select * into l from public.leads where id = o.lead_id; end if;
  if o.client_id is not null then select * into c from public.clients where id = o.client_id; end if;
  v_od := coalesce(q.offer_details, '{}'::jsonb);
  if q.project_location_id is not null then
    select address_street, house_number, postal_code, city into v_pl_street, v_pl_house, v_pl_postal, v_pl_city
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
  -- Opdrachtomschrijving = de "Levering en installatie"-tekst (offerte -> standaard).
  v_notes := coalesce(nullif(btrim(v_od->>'leveringText'), ''), v_default_levering);
  update public.installation_orders set
    site_street        = coalesce(nullif(btrim(site_street), ''), v_street),
    site_house_number  = coalesce(nullif(btrim(site_house_number), ''), v_house),
    site_postal        = coalesce(nullif(btrim(site_postal), ''), v_postal),
    site_city          = coalesce(nullif(btrim(site_city), ''), v_city),
    site_contact_name  = coalesce(nullif(btrim(site_contact_name), ''), c.contact_name, q.prospect_contact, l.contact_name),
    site_contact_email = coalesce(nullif(btrim(site_contact_email), ''), c.contact_email, q.prospect_email, l.contact_email),
    site_contact_phone = coalesce(nullif(btrim(site_contact_phone), ''), c.contact_phone, l.contact_phone),
    notes              = coalesce(nullif(btrim(notes), ''), v_notes),
    updated_at = now()
  where id = p_order_id;
end;
$$;

-- 2) AFTER INSERT-trigger: elke nieuwe order met quote_id automatisch vullen (adres + opdrachtomschrijving).
create or replace function app_private.installation_orders_autofill()
returns trigger language plpgsql security definer set search_path to 'public', 'app_private' as $$
begin
  if new.quote_id is not null then
    -- Generieke auto-notitie als 'leeg' behandelen zodat de echte leveringText ingevuld wordt.
    if new.notes is not null and (new.notes like 'Vanuit getekende offerte%' or new.notes like 'Alleen-installatie order%' or new.notes like 'Aangemaakt via offerte%') then
      update public.installation_orders set notes = null where id = new.id;
    end if;
    perform app_private.fill_installation_order_site(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists installation_orders_autofill on public.installation_orders;
create trigger installation_orders_autofill
  after insert on public.installation_orders
  for each row execute function app_private.installation_orders_autofill();
