-- Contacten-cache zelfhelend maken bij ontkoppelen/verwijderen van een bedrijf.
--
-- Probleem: de FK's company_id zijn ON DELETE SET NULL, dus bij het verwijderen van een bedrijf
-- wordt company_id correct genulld op leads/quotes. Maar de sync-triggers schreven de naam-cache
-- (leads.company_name / quotes.prospect_company) alléén wanneer company_id NOT NULL was — nooit als
-- die null werd. Daardoor bleef de oude (soms "-") bedrijfsnaam hangen op de lead én de offerte.
--
-- Oplossing: een ON DELETE SET NULL vuurt de BEFORE UPDATE-trigger van de kindrij. Door de sync-
-- triggers ook het company_id-IS-NULL-geval te laten afhandelen, herstelt zowel verwijderen als
-- handmatig ontkoppelen zichzelf. company_name (NOT NULL) valt terug op de persoonsnaam/"Particulier";
-- prospect_company (nullable) wordt geleegd (de UI valt terug op prospect_contact).
-- clients blijven bewust ongemoeid (company_name is daar een display/soft-delete-label).

-- 1) Leads: company_name = bedrijfsnaam, anders persoonsnaam/"Particulier".
create or replace function public.tg_leads_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text; prole text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  elsif new.company_id is null
        and (tg_op = 'INSERT'
             or new.company_id is distinct from old.company_id
             or new.person_id  is distinct from old.person_id) then
    -- Geen bedrijf (particulier of ontkoppeld): titel = persoonsnaam, anders "Particulier".
    new.company_name := coalesce(
      (select nullif(full_name, '') from public.persons where id = new.person_id),
      'Particulier');
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), nullif(email,''), nullif(phone,''), nullif(role,'') into pfull, pemail, pphone, prole
    from public.persons where id = new.person_id;
    new.contact_name  := coalesce(pfull,  new.contact_name);
    new.contact_email := coalesce(pemail, new.contact_email);
    new.contact_phone := coalesce(pphone, new.contact_phone);
    new.contact_role  := coalesce(prole,  new.contact_role);
  end if;
  return new;
end $$;

-- 2) Quotes: prospect_company = bedrijfsnaam, anders NULL (UI valt terug op prospect_contact).
create or replace function public.tg_quotes_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.prospect_company := cname; end if;
  elsif new.company_id is null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    new.prospect_company := null; -- particulier / ontkoppeld: geen achtergebleven bedrijfsnaam
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), nullif(email,'') into pfull, pemail from public.persons where id = new.person_id;
    new.prospect_contact := coalesce(pfull,  new.prospect_contact);
    new.prospect_email   := coalesce(pemail, new.prospect_email);
  end if;
  return new;
end $$;

-- 3) Persons-propagate: houd óók de particulier-lead-titel (company_name) vers bij hernoemen.
create or replace function public.tg_persons_propagate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.role  is distinct from old.role then
    update public.leads   set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone, contact_role = new.role where person_id = new.id;
    update public.clients set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone where person_id = new.id;
    update public.quotes  set prospect_contact = nullif(new.full_name,''), prospect_email = new.email where person_id = new.id;
    -- Particulier-leads tonen de persoonsnaam als titel (company_name) → bij hernoemen mee bijwerken.
    update public.leads   set company_name = coalesce(nullif(new.full_name,''), 'Particulier') where person_id = new.id and company_id is null;
  end if;
  return null;
end $$;

-- 4) Eenmalige backfill van bestaande, achtergebleven cache (idempotent).
update public.leads
  set company_name = coalesce((select nullif(full_name,'') from public.persons where id = leads.person_id), 'Particulier')
  where company_id is null;

update public.quotes
  set prospect_company = null
  where company_id is null and prospect_company is not null;
