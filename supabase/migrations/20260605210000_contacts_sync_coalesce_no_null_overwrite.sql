-- FIX: de contact-sync-triggers overschreven een aangeleverd contact_email met
-- het (lege) persoonsadres. Nu COALESCE: de persoon wint alleen als die een
-- waarde heeft; anders blijft de aangeleverde waarde staan. Voorkomt dat
-- uitnodigingen mislukken doordat contact_email per ongeluk op null kwam.

create or replace function public.tg_leads_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text; prole text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
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

create or replace function public.tg_clients_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text;
begin
  if new.company_id is not null and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  end if;
  if new.person_id is not null and (tg_op = 'INSERT' or new.person_id is distinct from old.person_id) then
    select nullif(full_name,''), nullif(email,''), nullif(phone,'') into pfull, pemail, pphone
    from public.persons where id = new.person_id;
    new.contact_name  := coalesce(pfull,  new.contact_name);
    new.contact_email := coalesce(pemail, new.contact_email);
    new.contact_phone := coalesce(pphone, new.contact_phone);
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
    select nullif(full_name,''), nullif(email,'') into pfull, pemail from public.persons where id = new.person_id;
    new.prospect_contact := coalesce(pfull,  new.prospect_contact);
    new.prospect_email   := coalesce(pemail, new.prospect_email);
  end if;
  return new;
end $$;

-- Backfill 1: completeer de persoon-bron met e-mail/telefoon uit gekoppelde lead/client.
update public.persons p set
  email = coalesce(nullif(p.email,''), sub.email),
  phone = coalesce(nullif(p.phone,''), sub.phone)
from (
  select pp.id,
    coalesce((select nullif(l.contact_email,'') from public.leads l where l.person_id = pp.id and nullif(l.contact_email,'') is not null order by l.created_at desc limit 1),
             (select nullif(c.contact_email,'') from public.clients c where c.person_id = pp.id and nullif(c.contact_email,'') is not null limit 1)) as email,
    coalesce((select nullif(l.contact_phone,'') from public.leads l where l.person_id = pp.id and nullif(l.contact_phone,'') is not null order by l.created_at desc limit 1),
             (select nullif(c.contact_phone,'') from public.clients c where c.person_id = pp.id and nullif(c.contact_phone,'') is not null limit 1)) as phone
  from public.persons pp
  where nullif(pp.email,'') is null or nullif(pp.phone,'') is null
) sub
where p.id = sub.id and (sub.email is not null or sub.phone is not null);

-- Backfill 2: vul lege clients.contact_email vanuit persoon/lead/offerte.
update public.clients c set contact_email = sub.email
from (
  select cc.id,
    coalesce(nullif(p.email,''),
      (select nullif(l.contact_email,'') from public.leads l where l.converted_client_id = cc.id and nullif(l.contact_email,'') is not null order by l.created_at desc limit 1),
      (select nullif(q.prospect_email,'') from public.quotes q where q.client_id = cc.id and nullif(q.prospect_email,'') is not null order by q.created_at desc limit 1)
    ) as email
  from public.clients cc left join public.persons p on p.id = cc.person_id
  where nullif(cc.contact_email,'') is null
) sub
where c.id = sub.id and sub.email is not null;
