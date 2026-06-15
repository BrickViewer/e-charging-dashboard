-- E-Group koppeling voor installatie-orders.
-- Voegt sync-velden toe (overdracht naar + terugkoppeling vanuit de E-Group portal)
-- en een bewerkbaar site-adres/contact-snapshot. Het snapshot maakt het overzicht
-- compleet en zorgt dat de handoff een geldig (NOT NULL) project-adres kan vullen,
-- ook als het adres in de e-charging-data nog incompleet was.

-- Sync-velden ---------------------------------------------------------------
alter table public.installation_orders add column if not exists egroup_order_id text;
alter table public.installation_orders add column if not exists egroup_order_number text;
alter table public.installation_orders add column if not exists handoff_at timestamptz;
alter table public.installation_orders add column if not exists completed_at timestamptz;
alter table public.installation_orders add column if not exists external_status text;
alter table public.installation_orders add column if not exists last_sync_error text;
alter table public.installation_orders add column if not exists service_category text not null default 'e_charging';

-- Bewerkbaar site-adres + contact (snapshot) --------------------------------
alter table public.installation_orders add column if not exists site_street text;
alter table public.installation_orders add column if not exists site_house_number text;
alter table public.installation_orders add column if not exists site_postal text;
alter table public.installation_orders add column if not exists site_city text;
alter table public.installation_orders add column if not exists site_contact_name text;
alter table public.installation_orders add column if not exists site_contact_email text;
alter table public.installation_orders add column if not exists site_contact_phone text;
-- Korte service-samenvatting voor het overzicht, bv. "10 laadpunten".
alter table public.installation_orders add column if not exists service_summary text;

-- service_category beperken tot de vier E-Group business lines (toekomstvast).
alter table public.installation_orders drop constraint if exists installation_orders_service_category_check;
alter table public.installation_orders add constraint installation_orders_service_category_check
  check (service_category in ('e_check','e_charging','e_make','e_maintenance'));

-- egroup_order_id uniek wanneer gezet (idempotente sync).
create unique index if not exists installation_orders_egroup_order_id_idx
  on public.installation_orders(egroup_order_id) where egroup_order_id is not null;

-- Backfill van het site-snapshot voor bestaande rijen (no-op bij lege tabel).
-- Adres komt bij voorkeur van de lead (door sales vastgelegd site-adres), met
-- terugval op het facturatie-adres van de klant. Huisnummer wordt best-effort
-- van de straat gesplitst (laatste getal + optionele letter/toevoeging).
update public.installation_orders io
set
  site_street = coalesce(
    io.site_street,
    nullif(trim(regexp_replace(coalesce(l.address_street, c.billing_address_street, ''), '\s*\d+\s*[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?\s*$', '')), '')
  ),
  site_house_number = coalesce(
    io.site_house_number,
    nullif(substring(coalesce(l.address_street, c.billing_address_street, '') from '(\d+\s*[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s*$'), '')
  ),
  site_postal = coalesce(io.site_postal, l.postal_code, c.billing_address_postal),
  site_city = coalesce(io.site_city, l.city, c.billing_address_city),
  site_contact_name = coalesce(io.site_contact_name, l.contact_name, c.contact_name),
  site_contact_email = coalesce(io.site_contact_email, l.contact_email, c.contact_email),
  site_contact_phone = coalesce(io.site_contact_phone, l.contact_phone, c.contact_phone)
from public.installation_orders io2
left join public.leads l on l.id = io2.lead_id
left join public.clients c on c.id = io2.client_id
where io.id = io2.id;
