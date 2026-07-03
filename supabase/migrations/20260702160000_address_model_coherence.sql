-- Fase 2: adresmodel coherent.
-- Bedrijfsadres = facturatie/HQ op companies. Site-adres = het object (project_locations),
-- dat de lead-adrescache voedt. Company<->lead-propagatie wordt losgekoppeld van adres.

alter table public.leads add column if not exists house_number text;

-- companies -> leads/clients/quotes: adres NIET meer naar leads (naam/kvk/website/sector blijven).
create or replace function public.tg_companies_propagate()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
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
  return null;
end $function$;

-- leads -> companies: adres NIET meer terugduwen (kvk/website/sector blijven).
create or replace function public.tg_leads_propagate_company()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.company_id is not null
     and (tg_op = 'INSERT'
       or new.kvk     is distinct from old.kvk
       or new.website is distinct from old.website
       or new.sector  is distinct from old.sector)
  then
    update public.companies set
      kvk     = coalesce(nullif(new.kvk,''),     kvk),
      website = coalesce(nullif(new.website,''), website),
      sector  = coalesce(nullif(new.sector,''),  sector)
    where id = new.company_id
      and (coalesce(nullif(new.kvk,''),     kvk)     is distinct from kvk
        or coalesce(nullif(new.website,''), website) is distinct from website
        or coalesce(nullif(new.sector,''),  sector)  is distinct from sector);
  end if;
  return null;
end $function$;

-- object -> lead-adrescache (site-adres). Fires bij insert/adreswijziging/koppelen.
create or replace function public.tg_object_address_to_lead()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.lead_id is not null
     and (tg_op = 'INSERT'
       or new.address_street is distinct from old.address_street
       or new.house_number   is distinct from old.house_number
       or new.postal_code    is distinct from old.postal_code
       or new.city           is distinct from old.city
       or new.lead_id        is distinct from old.lead_id)
  then
    update public.leads set
      address_street = new.address_street,
      house_number   = new.house_number,
      postal_code    = new.postal_code,
      city           = new.city
    where id = new.lead_id
      and (address_street is distinct from new.address_street
        or house_number   is distinct from new.house_number
        or postal_code    is distinct from new.postal_code
        or city           is distinct from new.city);
  end if;
  return null;
end $function$;

drop trigger if exists tg_object_address_to_lead on public.project_locations;
create trigger tg_object_address_to_lead
  after insert or update on public.project_locations
  for each row execute function public.tg_object_address_to_lead();

-- Backfill: lead-adres uit het nieuwste, niet-lege gekoppelde object.
update public.leads l set
  address_street = o.address_street,
  house_number   = o.house_number,
  postal_code    = o.postal_code,
  city           = o.city
from (
  select distinct on (lead_id) lead_id, address_street, house_number, postal_code, city
  from public.project_locations
  where lead_id is not null and coalesce(btrim(address_street),'') <> ''
  order by lead_id, updated_at desc nulls last
) o
where o.lead_id = l.id
  and (l.address_street is distinct from o.address_street
    or l.house_number   is distinct from o.house_number
    or l.postal_code    is distinct from o.postal_code
    or l.city           is distinct from o.city);
