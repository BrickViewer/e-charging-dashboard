-- Volledig adres op personen + huisnummer op bedrijven, zodat bedrijf/persoon/object alle drie een compleet adres
-- kunnen dragen (incl. particulier-persoon → offerte). Additief; geen wijziging aan bestaande sync-triggers.

alter table public.persons
  add column if not exists address_street text,
  add column if not exists house_number text,
  add column if not exists postal_code text,
  add column if not exists city text;

alter table public.companies add column if not exists house_number text;
