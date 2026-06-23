-- Eenmalige backfill: duw bestaande, op de lead getypte bedrijfsattributen naar het
-- gekoppelde bedrijf (companies = bron van waarheid). Last-write-wins: een niet-lege
-- leadwaarde overschrijft; een lege leadwaarde overschrijft nooit. Per bedrijf telt de
-- meest recent gewijzigde lead. Herstelt o.a. FlexHero (kvk/website stonden alleen op de lead).
-- Idempotent: draait alleen waar waarden verschillen.
with latest as (
  select distinct on (company_id) company_id, kvk, website, sector, address_street, postal_code, city
  from public.leads where company_id is not null
  order by company_id, updated_at desc
)
update public.companies c set
  kvk            = coalesce(nullif(l.kvk,''),            c.kvk),
  website        = coalesce(nullif(l.website,''),        c.website),
  sector         = coalesce(nullif(l.sector,''),         c.sector),
  address_street = coalesce(nullif(l.address_street,''), c.address_street),
  postal_code    = coalesce(nullif(l.postal_code,''),    c.postal_code),
  city           = coalesce(nullif(l.city,''),           c.city)
from latest l
where c.id = l.company_id
  and (coalesce(nullif(l.kvk,''),c.kvk)                     is distinct from c.kvk
    or coalesce(nullif(l.website,''),c.website)            is distinct from c.website
    or coalesce(nullif(l.sector,''),c.sector)              is distinct from c.sector
    or coalesce(nullif(l.address_street,''),c.address_street) is distinct from c.address_street
    or coalesce(nullif(l.postal_code,''),c.postal_code)    is distinct from c.postal_code
    or coalesce(nullif(l.city,''),c.city)                  is distinct from c.city);
