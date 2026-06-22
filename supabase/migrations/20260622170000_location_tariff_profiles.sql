-- Tarieven + service-fee per LOCATIE: tariff_profiles wordt de bron (gekoppeld aan e-Flux locations).
-- Fase 1 = schema + backfill, gedragsneutraal: de fee valt terug op exact de huidige waarde, dus de
-- afrekening blijft byte-identiek op de eerste run.

-- Out-of-band kolommen authoritatief maken (bestaan al live; IF NOT EXISTS = no-op daar, maar nodig
-- voor een schone DB die alleen migraties draait).
alter table public.tariff_profiles
  add column if not exists start_tariff           numeric not null default 0,
  add column if not exists idle_tariff_per_min     numeric not null default 0,
  add column if not exists charge_rate_per_kwh      numeric default 0.55,
  add column if not exists energy_cost_per_kwh      numeric default 0.25,
  add column if not exists ere_rate_per_kwh         numeric default 0.10;

-- Nieuw: per-locatie service-fee (€/kWh). NULL → val terug op clients.echarging_fee_per_kwh → org default.
alter table public.tariff_profiles
  add column if not exists echarging_fee_per_kwh    numeric,
  add column if not exists contract_duration_months integer,
  add column if not exists notice_period_months     integer;

comment on column public.tariff_profiles.echarging_fee_per_kwh is
  'Per-locatie E-Charging service-fee (€/kWh). NULL → fallback clients.echarging_fee_per_kwh → organizations.default_echarging_fee_per_kwh.';

-- "Huidige" tarief = laatste valid_from per locatie. Index + integriteit (1 rij per locatie+datum).
create index if not exists tariff_profiles_location_validfrom_idx
  on public.tariff_profiles (location_id, valid_from desc) where location_id is not null;
create unique index if not exists tariff_profiles_location_validfrom_unique
  on public.tariff_profiles (location_id, valid_from) where location_id is not null;

-- Backfill: één rij per gekoppelde (owned) locatie, uit de huidige klantwaarden. echarging_fee_per_kwh
-- blijft de klant-waarde (vaak NULL → org default), zodat de fee-resolutie identiek is aan vandaag.
insert into public.tariff_profiles
  (client_id, location_id, echarging_fee_per_kwh, charge_rate_per_kwh, energy_cost_per_kwh,
   ere_rate_per_kwh, idle_tariff_per_min, start_tariff, valid_from)
select l.client_id, l.id,
       c.echarging_fee_per_kwh,
       coalesce(c.charge_rate_per_kwh, 0.55), coalesce(c.energy_cost_per_kwh, 0.25),
       coalesce(c.ere_rate_per_kwh, 0.10), 0, 0,
       coalesce(l.client_assigned_at::date, current_date)
from public.locations l
join public.clients c on c.id = l.client_id
where l.client_id is not null
  and not exists (select 1 from public.tariff_profiles tp where tp.location_id = l.id);
