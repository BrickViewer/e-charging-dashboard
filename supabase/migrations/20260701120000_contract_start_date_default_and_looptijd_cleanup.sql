-- Contract-startdatum: automatisch de aanmaakdatum als geen expliciete waarde wordt meegegeven.
-- create_client_from_quote / lead-convert-to-client / configurator-finalize-client laten de kolom weg → kregen NULL.
-- De wizard zet 'm al expliciet op vandaag (zelfde resultaat).
ALTER TABLE public.clients ALTER COLUMN contract_start_date SET DEFAULT CURRENT_DATE;

-- Bestaande-data-correctie:
-- 1) Wizard-artefact: oude hardcoded 36-maanden-looptijd terug naar de standaard 12.
UPDATE public.clients SET contract_duration_months = 12 WHERE contract_duration_months = 36;

-- 2) Actieve klanten zonder startdatum (van-offerte/lead) → aanvullen met de aanmaakdatum;
--    soft-deleted/test-rijen blijven ongemoeid.
UPDATE public.clients SET contract_start_date = created_at::date
WHERE contract_start_date IS NULL AND status <> 'verwijderd';
