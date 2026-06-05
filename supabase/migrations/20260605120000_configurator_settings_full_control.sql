-- Configurator v5 — volledige admin-controle.
-- Backfilt bestaande configurator_settings.settings (jsonb) met de nieuwe velden
-- (ERE-subsidie, investeringsschatting per laadpunt, standaard aantal laadpunten,
-- invoer-/slidergrenzen, en de locatietypes-lijst). Additief en idempotent:
-- `defaults || settings` voegt alleen ontbrekende top-level keys toe; bestaande
-- waarden blijven behouden.

update public.configurator_settings
set settings = jsonb_build_object(
  'ereSubsidyPerKwh', 0.10,
  'ereEnabledByDefault', false,
  'investmentPerSocketLow', 1500,
  'investmentPerSocketHigh', 3000,
  'investmentPerSocketMax', 4500,
  'defaultSocketCount', 8,
  'inputRanges', jsonb_build_object(
    'chargeTariffMin', 0.39, 'chargeTariffMax', 0.79, 'chargeTariffStep', 0.01,
    'kwhMin', 0, 'kwhMax', 900, 'kwhStep', 10,
    'sessionsMin', 0, 'sessionsMax', 90, 'sessionsStep', 1,
    'socketsMin', 1, 'socketsMax', 200,
    'investmentSliderFloor', 6000, 'investmentSliderStep', 500,
    'intensityDivisor', 650
  ),
  'locationTypes', jsonb_build_array(
    jsonb_build_object('key', 'workplace', 'label', 'Werkplek'),
    jsonb_build_object('key', 'destination', 'label', 'Bestemming'),
    jsonb_build_object('key', 'fleet', 'label', 'Vloot'),
    jsonb_build_object('key', 'public', 'label', 'Publiek'),
    jsonb_build_object('key', 'other', 'label', 'Anders')
  )
) || settings;
