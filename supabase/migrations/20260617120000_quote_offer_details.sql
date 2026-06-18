-- Offerte-sjabloon: per-offerte velden + overrides voor de 1:1 offerte-PDF.
-- Eén jsonb-kolom (parallel aan tariff_data/calculation_snapshot) houdt alle
-- offerte-specifieke vrije tekst en overrides bij. Bestaande rijen krijgen {}.
alter table public.quotes
  add column if not exists offer_details jsonb not null default '{}'::jsonb;

comment on column public.quotes.offer_details is
  'Offerte-sjabloonvelden (adres, object/betreft/aanhef, scope, datums, overrides op de org-standaarden). Vult de placeholders van de offerte-PDF.';
