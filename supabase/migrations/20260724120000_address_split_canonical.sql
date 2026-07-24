-- Straat/huisnummer gelijktrekken: één canonieke splitser + eenmalige datafix.
--
-- Aanleiding: bij o.a. Albert Vos stond "Alfred Smithlaan 37" in het STRAATVELD met
-- house_number leeg. Oorzaak was tweeledig: (1) vervuilde data, (2) er bestonden VIJF
-- eigen adressplitsers in de codebase met drie verschillende gedragingen, waardoor elk
-- scherm zijn eigen aannames had.
--
-- De canonieke definitie woont nu in apps/admin/src/lib/houseNumber.ts; deze SQL-functie en
-- supabase/functions/_shared/installationHandoff.ts zijn de twee spiegels. De gedeelde
-- testtabel staat in apps/admin/src/services/address.parity.test.ts — wijzigt het gedrag,
-- controleer alle drie.

-- ── 1. Splitser gelijktrekken ────────────────────────────────────────────────────────────
-- Was subtiel anders dan de frontend/edge: "Dorpsstraat 12 A" gaf hier geen huisnummer
-- terwijl de andere twee '12A' teruggaven.
create or replace function app_private.split_dutch_address(p_addr text)
returns table(street text, house text)
language sql
immutable
set search_path to 'public'
as $function$
  select
    btrim(regexp_replace(coalesce(p_addr, ''), '\s*\d+\s*[A-Za-z]?([-/]\d+\s*[A-Za-z]?)?\s*$', '')),
    nullif(
      regexp_replace(
        coalesce((regexp_match(coalesce(p_addr, ''), '(\d+\s*[A-Za-z]?(?:[-/]\d+\s*[A-Za-z]?)?)\s*$'))[1], ''),
        '\s+', '', 'g'),
      '');
$function$;

-- ── 2. Eenmalige datafix ─────────────────────────────────────────────────────────────────
-- Raakte 5 rijen (FlexHero, 2 leads, 2 objecten). Harde guard `house_number is null`: waar het
-- huisnummer al apart staat wordt niets aangeraakt, dus het nummer kan nooit dubbel komen.
--
-- Objectnamen blijven gelijk: app_private.build_object_label plakt straat + huisnummer weer aan
-- elkaar, dus display_name verandert niet en de SharePoint-map wordt niet hernoemd.
-- (Geverifieerd in BEGIN..ROLLBACK vóór toepassing.)

update public.companies c set address_street = x.street, house_number = x.house
from (select id, (app_private.split_dutch_address(address_street)).* from public.companies where house_number is null) x
where c.id = x.id and x.house is not null;

update public.leads l set address_street = x.street, house_number = x.house
from (select id, (app_private.split_dutch_address(address_street)).* from public.leads where house_number is null) x
where l.id = x.id and x.house is not null;

update public.project_locations p set address_street = x.street, house_number = x.house
from (select id, (app_private.split_dutch_address(address_street)).* from public.project_locations where house_number is null) x
where p.id = x.id and x.house is not null;

update public.persons pe set address_street = x.street, house_number = x.house
from (select id, (app_private.split_dutch_address(address_street)).* from public.persons where house_number is null) x
where pe.id = x.id and x.house is not null;

update public.installation_orders o set site_street = x.street, site_house_number = x.house
from (select id, (app_private.split_dutch_address(site_street)).* from public.installation_orders where site_house_number is null) x
where o.id = x.id and x.house is not null;
