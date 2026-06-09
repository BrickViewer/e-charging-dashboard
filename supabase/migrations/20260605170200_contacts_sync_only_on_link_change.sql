-- Sync de inline cache alleen bij INSERT of wanneer de koppeling (company_id/
-- person_id) wijzigt. Zo overschrijven gewone updates (status, adres, …) de
-- inline velden niet, en blijven bestaande edit-schermen werken.

create or replace function public.tg_leads_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text; prole text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), email, phone, role into pfull, pemail, pphone, prole
    from public.persons where id = new.person_id;
    new.contact_name := pfull; new.contact_email := pemail; new.contact_phone := pphone; new.contact_role := prole;
  end if;
  return new;
end $$;

create or replace function public.tg_clients_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), email, phone into pfull, pemail, pphone
    from public.persons where id = new.person_id;
    new.contact_name := pfull; new.contact_email := pemail; new.contact_phone := pphone;
  end if;
  return new;
end $$;

create or replace function public.tg_quotes_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.prospect_company := cname; end if;
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), email into pfull, pemail from public.persons where id = new.person_id;
    new.prospect_contact := pfull; new.prospect_email := pemail;
  end if;
  return new;
end $$;
