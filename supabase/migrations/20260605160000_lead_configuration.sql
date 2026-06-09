-- De volledige configurator-configuratie van een lead (pricing_input/result +
-- ere/investering + settings_version). Hieruit stellen we de offerte op en maken
-- we bij conversie een klant met exact deze gegevens.
alter table public.leads add column if not exists configuration jsonb;
alter table public.leads add column if not exists configuration_updated_at timestamptz;
