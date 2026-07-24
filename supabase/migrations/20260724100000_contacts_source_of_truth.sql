-- Contacten (persons/companies) = bron van waarheid voor identiteit; clients draagt de
-- OVEREENKOMST (klantnummer, tarieven, contract, portaal) en houdt de identiteitsvelden
-- alleen nog als afgeleide cache.
--
-- Drie gaten die deze migratie dicht:
--   1a. update_portal_company_details schreef ALLEEN naar clients — juist de klant zelf
--       (de verste bron van waarheid over zijn eigen gegevens) bereikte Contacten nooit.
--   1b. Adres werd nergens gepropageerd, terwijl buildDebtorParams (WeFact) het adres
--       UITSLUITEND uit persons/companies leest → factuur zonder adresregel.
--   1c. tg_persons_propagate zette wel leads.company_name bij company_id is null, maar
--       niet clients.company_name → hernoemde particulier hield zijn oude klantnaam.

-- ── 1b/1c: propagatie contact → clients uitbreiden met adres + particuliernaam ──────────

create or replace function public.tg_persons_propagate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_street text := btrim(concat_ws(' ', nullif(btrim(coalesce(new.address_street,'')),''),
                                        nullif(btrim(coalesce(new.house_number,'')),'')));
begin
  if new.full_name is distinct from old.full_name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.role  is distinct from old.role then
    update public.leads   set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone, contact_role = new.role where person_id = new.id;
    update public.clients set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone where person_id = new.id;
    update public.quotes  set prospect_contact = nullif(new.full_name,''), prospect_email = new.email where person_id = new.id;
    update public.leads   set company_name = coalesce(nullif(new.full_name,''), 'Particulier') where person_id = new.id and company_id is null;
    -- Particulier: de klantnaam ís de persoonsnaam. Deze tak ontbrak (stond alleen op leads),
    -- waardoor hernoemen in Contacten de klantnaam liet staan.
    update public.clients set company_name = coalesce(nullif(new.full_name,''), 'Particulier')
    where person_id = new.id and company_id is null
      and company_name is distinct from coalesce(nullif(new.full_name,''), 'Particulier');
  end if;

  -- Adres: het contact is de bron, clients krijgt de samengevoegde cache. Alleen voor
  -- particulieren — bij een zakelijke klant is het factuuradres dat van het BEDRIJF.
  if new.address_street is distinct from old.address_street
     or new.house_number is distinct from old.house_number
     or new.postal_code  is distinct from old.postal_code
     or new.city         is distinct from old.city then
    update public.clients set
      billing_address_street = nullif(v_street, ''),
      billing_address_postal = new.postal_code,
      billing_address_city   = new.city,
      billing_address        = nullif(btrim(concat_ws(', ', nullif(v_street,''),
                                     nullif(btrim(concat_ws(' ', new.postal_code, new.city)),''))), '')
    where person_id = new.id and company_id is null;
  end if;
  return null;
end $function$;

create or replace function public.tg_companies_propagate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_street text := btrim(concat_ws(' ', nullif(btrim(coalesce(new.address_street,'')),''),
                                        nullif(btrim(coalesce(new.house_number,'')),'')));
begin
  if (new.name       is distinct from old.name
   or new.kvk        is distinct from old.kvk
   or new.btw_number is distinct from old.btw_number
   or new.website    is distinct from old.website
   or new.sector     is distinct from old.sector) then

    update public.leads set
      company_name = new.name, kvk = new.kvk, website = new.website, sector = new.sector
    where company_id = new.id
      and (company_name is distinct from new.name
        or kvk     is distinct from new.kvk
        or website is distinct from new.website
        or sector  is distinct from new.sector);

    update public.clients set
      company_name = new.name, kvk = new.kvk, btw_number = new.btw_number
    where company_id = new.id
      and (company_name is distinct from new.name
        or kvk        is distinct from new.kvk
        or btw_number is distinct from new.btw_number);

    update public.quotes set prospect_company = new.name
    where company_id = new.id and prospect_company is distinct from new.name;
  end if;

  -- Bedrijfsadres = het factuuradres (zie contacts-objects-model: site-adres woont op het
  -- object, niet hier). clients draagt alleen nog de cache.
  if new.address_street is distinct from old.address_street
     or new.house_number is distinct from old.house_number
     or new.postal_code  is distinct from old.postal_code
     or new.city         is distinct from old.city then
    update public.clients set
      billing_address_street = nullif(v_street, ''),
      billing_address_postal = new.postal_code,
      billing_address_city   = new.city,
      billing_address        = nullif(btrim(concat_ws(', ', nullif(v_street,''),
                                     nullif(btrim(concat_ws(' ', new.postal_code, new.city)),''))), '')
    where company_id = new.id;
  end if;
  return null;
end $function$;

-- ── 1a: het klantportaal schrijft eerst naar het contact ────────────────────────────────
-- Helper zodat de portaal-RPC en de backfill dezelfde logica delen. SECURITY DEFINER:
-- persons/companies zijn intern-only (RLS), een portaalklant mag er niet direct bij.
-- De aanroeper mag voor-/achternaam meegeven. De portaal-RPC kent ze AL los (twee aparte
-- formuliervelden); ze samenvoegen en hier weer splitsen ging mis bij tussenvoegsels, want
-- split_person_name knipt op de LAATSTE spatie → "Albert de Vos" werd "Albert de"/"Vos".
-- Alleen de backfill (die niets anders heeft dan contact_name) valt terug op de splitser.
create or replace function app_private.push_client_identity_to_contacts(
  p_client_id uuid,
  p_first_name text default null,
  p_last_name  text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  c public.clients%rowtype;
  v_street text;
  v_house  text;
  v_first  text;
  v_last   text;
begin
  select * into c from public.clients where id = p_client_id;
  if not found then return; end if;

  select street, house into v_street, v_house
  from app_private.split_dutch_address(c.billing_address_street);
  -- Vormen als "Kerkstraat 1 bis" splitsen niet; dan het contactadres niet aanraken
  -- i.p.v. een half adres wegschrijven.
  if v_house is null then v_street := null; end if;

  if c.person_id is not null then
    v_first := nullif(btrim(coalesce(p_first_name, '')), '');
    v_last  := nullif(btrim(coalesce(p_last_name,  '')), '');
    if v_first is null and v_last is null then
      select first_name, last_name into v_first, v_last
      from app_private.split_person_name(c.contact_name);
    end if;

    -- persons.full_name is GENERATED uit first+last, dus die volgt vanzelf.
    update public.persons p set
      first_name = coalesce(v_first, p.first_name),
      last_name  = coalesce(v_last,  p.last_name),
      phone      = coalesce(nullif(btrim(coalesce(c.contact_phone,'')),''), p.phone),
      address_street = coalesce(v_street, p.address_street),
      house_number   = coalesce(v_house,  p.house_number),
      postal_code    = coalesce(nullif(btrim(coalesce(c.billing_address_postal,'')),''), p.postal_code),
      city           = coalesce(nullif(btrim(coalesce(c.billing_address_city,'')),''),   p.city)
    where p.id = c.person_id;

    -- E-mail apart: persons_org_email_unique kan botsen met een ANDER contact. Een
    -- portaalklant mag nooit een bestaand contact kunnen kapen, dus dan gewoon niet
    -- verplaatsen (de klantrij houdt zijn eigen waarde).
    if nullif(btrim(coalesce(c.contact_email,'')),'') is not null then
      begin
        update public.persons set email = lower(btrim(c.contact_email))
        where id = c.person_id and lower(btrim(coalesce(email,''))) is distinct from lower(btrim(c.contact_email));
      exception when unique_violation then
        null;
      end;
    end if;
  end if;

  if c.company_id is not null then
    update public.companies co set
      name       = coalesce(nullif(btrim(coalesce(c.company_name,'')),''), co.name),
      kvk        = coalesce(nullif(btrim(coalesce(c.kvk,'')),''), co.kvk),
      btw_number = coalesce(nullif(btrim(coalesce(c.btw_number,'')),''), co.btw_number),
      address_street = coalesce(v_street, co.address_street),
      house_number   = coalesce(v_house,  co.house_number),
      postal_code    = coalesce(nullif(btrim(coalesce(c.billing_address_postal,'')),''), co.postal_code),
      city           = coalesce(nullif(btrim(coalesce(c.billing_address_city,'')),''),   co.city)
    where co.id = c.company_id;
  end if;
end $function$;

revoke all on function app_private.push_client_identity_to_contacts(uuid, text, text) from public, anon, authenticated;

-- Portaal-RPC: ongewijzigde validatie + clients-update, met aan het eind de doorschrijving
-- naar het contact. De klant blijft dus gewoon invullen waar hij gewend is; de identiteit
-- landt daarna op persons/companies en propageert vandaar terug als cache.
CREATE OR REPLACE FUNCTION public.update_portal_company_details(p_company_name text, p_kvk text, p_btw_number text, p_contact_first_name text, p_contact_last_name text, p_contact_email text, p_contact_country_code text, p_contact_phone text, p_billing_address_street text, p_billing_address_postal text, p_billing_address_city text, p_invoice_email text, p_calculate_ere_enabled boolean DEFAULT false, p_vat_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
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
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Geen klantportaal gekoppeld aan deze gebruiker'
      USING ERRCODE = '42501';
  END IF;

  v_vat_status := nullif(trim(coalesce(p_vat_status, '')), '');
  IF v_vat_status IS NOT NULL AND v_vat_status NOT IN ('vat_liable','kor','private') THEN
    RAISE EXCEPTION 'Ongeldige BTW-status' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(v_vat_status, c.vat_status) INTO v_effective_vat_status
  FROM public.clients c WHERE c.id = v_client_id;

  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '[\s\.-]+', '', 'g')), '');
  v_kvk := nullif(regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g'), '');
  v_billing_postal := upper(regexp_replace(trim(coalesce(p_billing_address_postal, '')), '\s+', '', 'g'));
  v_invoice_email := lower(trim(coalesce(p_invoice_email, '')));
  v_contact_first_name := trim(coalesce(p_contact_first_name, ''));
  v_contact_last_name := trim(coalesce(p_contact_last_name, ''));
  v_contact_email := lower(trim(coalesce(p_contact_email, '')));
  v_contact_country_code := trim(coalesce(p_contact_country_code, '+31'));
  v_contact_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');

  IF v_contact_country_code IN ('31', 'NL+31', 'NL +31') THEN
    v_contact_country_code := '+31';
  END IF;

  IF left(v_contact_phone_digits, 4) = '0031' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 5);
  ELSIF left(v_contact_phone_digits, 2) = '31' AND length(v_contact_phone_digits) > 9 THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 3);
  END IF;

  IF left(v_contact_phone_digits, 1) = '0' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 2);
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Bedrijfsnaam is verplicht' USING ERRCODE = '22023';
  END IF;

  IF v_effective_vat_status IS NULL OR v_effective_vat_status IN ('vat_liable','kor') THEN
    IF v_kvk IS NULL OR v_kvk !~ '^[0-9]{8}$' THEN
      RAISE EXCEPTION 'KvK-nummer moet uit 8 cijfers bestaan' USING ERRCODE = '22023';
    END IF;
  ELSIF v_kvk IS NOT NULL AND v_kvk !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'KvK-nummer moet uit 8 cijfers bestaan' USING ERRCODE = '22023';
  END IF;

  IF v_effective_vat_status IS NULL OR v_effective_vat_status = 'vat_liable' THEN
    IF v_btw IS NULL OR v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' THEN
      RAISE EXCEPTION 'BTW-nummer heeft geen geldig formaat' USING ERRCODE = '22023';
    END IF;
  ELSIF v_btw IS NOT NULL AND v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' THEN
    RAISE EXCEPTION 'BTW-nummer heeft geen geldig formaat' USING ERRCODE = '22023';
  END IF;

  IF length(v_contact_first_name) < 2
    OR length(v_contact_last_name) < 2
    OR position('@' in v_contact_email) <= 1
    OR v_contact_country_code <> '+31'
    OR v_contact_phone_digits !~ '^[1-9][0-9]{8}$'
  THEN
    RAISE EXCEPTION 'Controleer de contactpersoon gegevens' USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_billing_address_street, ''))) < 3
    OR v_billing_postal !~ '^[1-9][0-9]{3}[A-Z]{2}$'
    OR length(trim(coalesce(p_billing_address_city, ''))) < 2
  THEN
    RAISE EXCEPTION 'Controleer het factuuradres' USING ERRCODE = '22023';
  END IF;

  IF position('@' in v_invoice_email) <= 1 THEN
    RAISE EXCEPTION 'Factuurmail heeft geen geldig formaat' USING ERRCODE = '22023';
  END IF;

  SELECT d.payout_iban
  INTO v_existing_iban
  FROM public.client_payment_details d
  WHERE d.client_id = v_client_id;

  UPDATE public.clients
  SET
    company_name = trim(p_company_name),
    kvk = v_kvk,
    btw_number = v_btw,
    contact_name = v_contact_first_name || ' ' || v_contact_last_name,
    contact_email = v_contact_email,
    contact_phone = v_contact_country_code || v_contact_phone_digits,
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = v_billing_postal,
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', '
      || v_billing_postal || ' '
      || trim(p_billing_address_city),
    calculate_ere_enabled = coalesce(p_calculate_ere_enabled, false),
    vat_status = COALESCE(v_vat_status, vat_status),
    vat_status_confirmed_at = CASE
      WHEN v_vat_status IS NOT NULL AND v_vat_status IS DISTINCT FROM vat_status THEN NULL
      ELSE vat_status_confirmed_at END,
    vat_status_confirmed_by = CASE
      WHEN v_vat_status IS NOT NULL AND v_vat_status IS DISTINCT FROM vat_status THEN NULL
      ELSE vat_status_confirmed_by END,
    payment_onboarding_status = CASE
      WHEN v_existing_iban IS NULL THEN 'missing'
      ELSE payment_onboarding_status
    END
  WHERE id = v_client_id;

  -- HIER: de klant is de beste bron over zijn eigen gegevens → door naar Contacten.
  -- De propagate-triggers spiegelen daarna terug (idempotent: waarden zijn al gelijk).
  PERFORM app_private.push_client_identity_to_contacts(v_client_id, v_contact_first_name, v_contact_last_name);

  INSERT INTO public.client_payment_details (
    client_id,
    invoice_email,
    account_holder_confirmed,
    status,
    submitted_at,
    updated_at
  )
  VALUES (
    v_client_id,
    v_invoice_email,
    false,
    'missing',
    v_now,
    v_now
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    invoice_email = EXCLUDED.invoice_email,
    status = CASE
      WHEN public.client_payment_details.payout_iban IS NULL THEN 'missing'
      ELSE public.client_payment_details.status
    END,
    updated_at = v_now;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_client_id,
    auth.uid(),
    'client_company_details_saved',
    'Klant heeft bedrijfs-, contact- en factuurgegevens opgeslagen',
    jsonb_build_object(
      'invoice_email', v_invoice_email,
      'contact_email', v_contact_email,
      'btw_number', v_btw,
      'vat_status', v_vat_status,
      'calculate_ere_enabled', coalesce(p_calculate_ere_enabled, false)
    )
  );
END;
$function$;

-- ── 1d: eenmalige backfill ──────────────────────────────────────────────────────────────
-- Klantidentiteit naar het contact duwen waar het contact nog leeg is. Raakte in de praktijk
-- 1 rij (Albert Vos had geen persoonsadres → zijn WeFact-debiteur zou zonder adresregel zijn
-- aangemaakt). De helper is coalesce-based: bestaande contactwaarden nooit met leeg overschrijven.
select app_private.push_client_identity_to_contacts(c.id)
from public.clients c
where c.status <> 'verwijderd';

-- ── 1e: privacy-wis neemt het contact mee ───────────────────────────────────────────────
-- Beslist of een contact nog aan levend werk hangt. Verwijzingen die BIJ DEZE klant horen
-- tellen niet mee (die zijn net geanonimiseerd); WeFact-facturen tellen ALTIJD als blokkade,
-- want de fiscale bewaarplicht (7 jaar) gaat voor op het recht op vergetelheid — zelfde
-- afweging als bij settlements ("factuur = echte omzet").
create or replace function app_private.contact_has_other_refs(
  p_table text, p_contact_id uuid, p_client_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'app_private'
as $function$
declare v_found boolean;
begin
  if p_contact_id is null then return true; end if;

  if p_table = 'persons' then
    select exists (select 1 from public.clients            x where x.person_id  = p_contact_id and x.id is distinct from p_client_id and x.status <> 'verwijderd')
        or exists (select 1 from public.leads              x where x.person_id  = p_contact_id and x.converted_client_id is distinct from p_client_id)
        or exists (select 1 from public.quotes             x where x.person_id  = p_contact_id and x.client_id           is distinct from p_client_id)
        or exists (select 1 from public.project_locations  x where x.person_id  = p_contact_id and x.client_id           is distinct from p_client_id)
        or exists (select 1 from public.wefact_invoices    x where x.person_id  = p_contact_id)
    into v_found;
  else
    select exists (select 1 from public.clients            x where x.company_id = p_contact_id and x.id is distinct from p_client_id and x.status <> 'verwijderd')
        or exists (select 1 from public.leads              x where x.company_id = p_contact_id and x.converted_client_id is distinct from p_client_id)
        or exists (select 1 from public.quotes             x where x.company_id = p_contact_id and x.client_id           is distinct from p_client_id)
        or exists (select 1 from public.project_locations  x where x.company_id = p_contact_id and x.client_id           is distinct from p_client_id)
        or exists (select 1 from public.installation_orders x where x.company_id = p_contact_id and x.client_id          is distinct from p_client_id)
        or exists (select 1 from public.wefact_invoices    x where x.company_id = p_contact_id)
    into v_found;
  end if;
  return coalesce(v_found, true);
end $function$;

revoke all on function app_private.contact_has_other_refs(text, uuid, uuid) from public, anon, authenticated;

-- Anonimiseert een contact. wefact_debtor_* blijft bewust staan: zonder die code is een
-- bestaande factuur in WeFact niet meer aan zijn debiteur te koppelen.
create or replace function app_private.anonymize_contact(p_table text, p_contact_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
begin
  if p_table = 'persons' then
    update public.persons set
      first_name = null, last_name = 'Verwijderd contact',
      email = null, phone = null, role = null, notes = null,
      address_street = null, house_number = null, postal_code = null, city = null
    where id = p_contact_id;
  else
    update public.companies set
      name = 'Verwijderd contact', kvk = null, btw_number = null, website = null, sector = null,
      notes = null, address_street = null, house_number = null, postal_code = null, city = null
    where id = p_contact_id;
  end if;
end $function$;

revoke all on function app_private.anonymize_contact(text, uuid) from public, anon, authenticated;
