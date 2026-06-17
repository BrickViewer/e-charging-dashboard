-- Start- en blokkeertarief staan voortaan standaard UIT in de configurator.
-- De code-defaults (pricing-engine + _shared/configurator.ts) zijn al omgezet, maar
-- normalizeSettings doet {...defaults, ...dbRaw} -> de DB-waarde wint. Daarom moeten
-- de bestaande actieve settings-records ook om, anders blijft de live configurator AAN.
-- Idempotent: kan veilig opnieuw draaien.
update public.configurator_settings
set settings = jsonb_set(
      jsonb_set(settings, '{defaultStartFeeEnabled}', 'false'::jsonb, true),
      '{defaultIdleFeeEnabled}', 'false'::jsonb, true)
where is_active = true;
