-- Future-proof: laat de cron (pg_cron -> pg_net) zich authenticeren bij de edge-functions.
-- Voorheen werd alleen de anon-key meegestuurd -> requireAdminOrInternal viel terug op de
-- JWT-route en gaf 401 ("Ongeldige sessie"), waardoor eflux-sync + aggregate-settlements
-- nooit automatisch draaiden. Nu sturen we ook x-internal-secret uit de vault mee.
--
-- AFHANKELIJKHEID (omgevingsdata, niet in deze migratie — net als de anon-key):
--   1. vault-secret `internal_function_secret` moet bestaan, bijv.:
--        SELECT vault.create_secret('<sterke-random-waarde>', 'internal_function_secret');
--   2. de edge-functiesecret INTERNAL_FUNCTION_SECRET (Supabase dashboard) moet exact
--      dezelfde waarde hebben — daar valideren eflux-sync + aggregate-settlements tegen.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $fn$
DECLARE
  anon_key text;
  internal_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO anon_key
  FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key';

  SELECT decrypted_secret INTO internal_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_function_secret';

  SELECT net.http_post(
    url := 'https://uuldldhmuanmjlyvnagt.supabase.co/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'x-internal-secret', coalesce(internal_secret, '')
    ),
    body := body
  ) INTO request_id;

  RETURN request_id;
END;
$fn$;
