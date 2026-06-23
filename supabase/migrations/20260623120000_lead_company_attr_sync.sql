-- Lead/bedrijf 1:1: bedrijfsattributen (kvk/website/sector/adres) beide richtingen syncen
-- tussen `companies` (bron van waarheid) en de inline-cache op `leads`/`clients`.
-- Voorheen propageerde tg_companies_propagate alleen `name`; kvk/website/sector/adres bleven
-- hangen op de lead en bereikten het bedrijf nooit (bv. Flex Hero). Recursie-veilig via
-- `is distinct from`-guards: een tegen-trigger zet dezelfde waarde → WHERE matcht 0 rijen → stopt.

-- companies -> leads/clients/quotes (uitgebreid met bedrijfsattributen)
create or replace function public.tg_companies_propagate()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if (new.name           is distinct from old.name
   or new.kvk            is distinct from old.kvk
   or new.btw_number     is distinct from old.btw_number
   or new.website        is distinct from old.website
   or new.sector         is distinct from old.sector
   or new.address_street is distinct from old.address_street
   or new.postal_code    is distinct from old.postal_code
   or new.city           is distinct from old.city) then

    -- leads cachen de volledige bedrijfsgegevens
    update public.leads set
      company_name   = new.name,
      kvk            = new.kvk,
      website        = new.website,
      sector         = new.sector,
      address_street = new.address_street,
      postal_code    = new.postal_code,
      city           = new.city
    where company_id = new.id
      and (company_name   is distinct from new.name
        or kvk            is distinct from new.kvk
        or website        is distinct from new.website
        or sector         is distinct from new.sector
        or address_street is distinct from new.address_street
        or postal_code    is distinct from new.postal_code
        or city           is distinct from new.city);

    -- clients cachen company_name/kvk/btw_number (geen website/sector; adres = aparte billing-velden)
    update public.clients set
      company_name = new.name,
      kvk          = new.kvk,
      btw_number   = new.btw_number
    where company_id = new.id
      and (company_name is distinct from new.name
        or kvk          is distinct from new.kvk
        or btw_number   is distinct from new.btw_number);

    -- quotes cachen alleen de naam; kvk/btw/website leest de UI via de company_id-join
    update public.quotes set prospect_company = new.name
    where company_id = new.id and prospect_company is distinct from new.name;
  end if;
  return null;
end $function$;

-- leads -> companies (last-write-wins): een niet-lege bedrijfswaarde getypt/geschreven op de lead
-- duwt door naar het gekoppelde bedrijf. Een lege leadwaarde overschrijft het bedrijf nooit.
create or replace function public.tg_leads_propagate_company()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.company_id is not null
     and (tg_op = 'INSERT'
       or new.kvk            is distinct from old.kvk
       or new.website        is distinct from old.website
       or new.sector         is distinct from old.sector
       or new.address_street is distinct from old.address_street
       or new.postal_code    is distinct from old.postal_code
       or new.city           is distinct from old.city)
  then
    update public.companies set
      kvk            = coalesce(nullif(new.kvk,''),            kvk),
      website        = coalesce(nullif(new.website,''),        website),
      sector         = coalesce(nullif(new.sector,''),         sector),
      address_street = coalesce(nullif(new.address_street,''), address_street),
      postal_code    = coalesce(nullif(new.postal_code,''),    postal_code),
      city           = coalesce(nullif(new.city,''),           city)
    where id = new.company_id
      and (coalesce(nullif(new.kvk,''),            kvk)            is distinct from kvk
        or coalesce(nullif(new.website,''),        website)        is distinct from website
        or coalesce(nullif(new.sector,''),         sector)         is distinct from sector
        or coalesce(nullif(new.address_street,''), address_street) is distinct from address_street
        or coalesce(nullif(new.postal_code,''),    postal_code)    is distinct from postal_code
        or coalesce(nullif(new.city,''),           city)           is distinct from city);
  end if;
  return null;
end $function$;

drop trigger if exists leads_propagate_company on public.leads;
create trigger leads_propagate_company
  after insert or update on public.leads
  for each row execute function public.tg_leads_propagate_company();
