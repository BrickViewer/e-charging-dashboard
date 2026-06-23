-- Opdrachtomschrijving (installation_orders.notes) = exact de "Levering en installatie"-tekst van de
-- offerte: offer_details.leveringText, met terugval op de standaardtekst (zoals de offerte-PDF doet via
-- firstStr(od.leveringText, DEFAULT_LEVERING_TEXT)). Geen kop (object/betreft) of beheer-regel meer.
create or replace function app_private.fill_installation_order_site(p_order_id uuid)
returns void language plpgsql security definer set search_path to 'public', 'app_private' as $$
declare
  o public.installation_orders%rowtype; q public.quotes%rowtype; l public.leads%rowtype; c public.clients%rowtype;
  v_od jsonb; v_pl_street text; v_pl_house text; v_pl_postal text; v_pl_city text;
  v_street text; v_house text; v_postal text; v_city text; v_split record;
  v_summary text; v_notes text; v_ncp int; v_charger text;
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
  v_ncp := q.num_charge_points;
  v_charger := nullif(btrim(v_od->>'chargerModel'), '');
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
  if v_ncp is not null then
    v_summary := v_ncp || ' laadpunt' || case when v_ncp = 1 then '' else 'en' end;
    if v_charger is not null then v_summary := v_summary || ' — ' || v_charger; end if;
  end if;
  -- Opdrachtomschrijving = de "Levering en installatie"-tekst (offerte → standaard).
  v_notes := coalesce(nullif(btrim(v_od->>'leveringText'), ''), v_default_levering);
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

-- Eenmalige refresh: vervang generieke/lege auto-notities op nog-niet-verzonden orders door de
-- echte opdrachtomschrijving. Reeds-verzonden (egroup_order_id) en handmatige teksten blijven ongemoeid.
update public.installation_orders
set notes = null, updated_at = now()
where egroup_order_id is null
  and (coalesce(btrim(notes), '') = ''
       or notes like 'Vanuit getekende offerte%'
       or notes like 'Aangemaakt via offerte%'
       or notes ilike '%hersteld na crash%');

select app_private.fill_installation_order_site(id)
from public.installation_orders
where egroup_order_id is null and coalesce(btrim(notes), '') = '';
