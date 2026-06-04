-- Drop organizations.eflux_api_key: de Road API key verhuist naar
-- Supabase Edge Function secret EFLUX_API_KEY (server-side, niet via DB).
-- Provider ID en master account ID blijven in deze tabel — geen secrets.

ALTER TABLE public.organizations DROP COLUMN IF EXISTS eflux_api_key;

COMMENT ON COLUMN public.organizations.eflux_provider_id IS
  'e-Flux Provider slug (publiek, bv NLEFL). API key staat in Supabase Edge Function secret EFLUX_API_KEY.';
