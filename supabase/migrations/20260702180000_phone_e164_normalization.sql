-- Telefoonnummers canoniek: alle telefoonkolommen worden bij insert/update naar E.164
-- genormaliseerd (dekt élk schrijfpad: app, intake-edges, configurator, portal-RPC).

create or replace function app_private.to_e164(raw text)
returns text language sql immutable set search_path = '' as $$
  with d as (
    select btrim(coalesce(raw,'')) as v,
           left(btrim(coalesce(raw,'')),1) = '+' as plus,
           regexp_replace(coalesce(raw,''), '\D', '', 'g') as digits
  )
  select case
    when v = ''         then null
    when digits = ''    then v                                   -- niets numeriek: bewaar
    when plus           then '+' || digits                       -- al internationaal
    when left(digits,2) = '00' then '+' || substring(digits from 3)
    when left(digits,1) = '0'  then '+31' || substring(digits from 2)
    when left(digits,2) = '31' and length(digits) >= 11 then '+' || digits
    else '+31' || digits                                         -- kale cijfers -> aanname NL
  end
  from d;
$$;

create or replace function app_private.tg_norm_phone() returns trigger language plpgsql set search_path='' as $$
begin new.phone := app_private.to_e164(new.phone); return new; end $$;

create or replace function app_private.tg_norm_contact_phone() returns trigger language plpgsql set search_path='' as $$
begin new.contact_phone := app_private.to_e164(new.contact_phone); return new; end $$;

create or replace function app_private.tg_norm_site_contact_phone() returns trigger language plpgsql set search_path='' as $$
begin new.site_contact_phone := app_private.to_e164(new.site_contact_phone); return new; end $$;

-- zz_-prefix zodat 'ie ná andere BEFORE-triggers (bv. contact-sync) draait en het eindresultaat normaliseert.
drop trigger if exists zz_normalize_phone on public.persons;
create trigger zz_normalize_phone before insert or update on public.persons
  for each row execute function app_private.tg_norm_phone();

drop trigger if exists zz_normalize_phone on public.organizations;
create trigger zz_normalize_phone before insert or update on public.organizations
  for each row execute function app_private.tg_norm_phone();

drop trigger if exists zz_normalize_phone on public.leads;
create trigger zz_normalize_phone before insert or update on public.leads
  for each row execute function app_private.tg_norm_contact_phone();

drop trigger if exists zz_normalize_phone on public.clients;
create trigger zz_normalize_phone before insert or update on public.clients
  for each row execute function app_private.tg_norm_contact_phone();

drop trigger if exists zz_normalize_phone on public.installation_orders;
create trigger zz_normalize_phone before insert or update on public.installation_orders
  for each row execute function app_private.tg_norm_site_contact_phone();

-- Backfill bestaande nummers.
update public.persons set phone = app_private.to_e164(phone)
  where phone is not null and phone is distinct from app_private.to_e164(phone);
update public.organizations set phone = app_private.to_e164(phone)
  where phone is not null and phone is distinct from app_private.to_e164(phone);
update public.leads set contact_phone = app_private.to_e164(contact_phone)
  where contact_phone is not null and contact_phone is distinct from app_private.to_e164(contact_phone);
update public.clients set contact_phone = app_private.to_e164(contact_phone)
  where contact_phone is not null and contact_phone is distinct from app_private.to_e164(contact_phone);
update public.installation_orders set site_contact_phone = app_private.to_e164(site_contact_phone)
  where site_contact_phone is not null and site_contact_phone is distinct from app_private.to_e164(site_contact_phone);
