-- Make generated Supabase Insert types treat client_number as optional.
-- The trigger remains as a guard for explicit null values and collision handling.

ALTER TABLE public.clients
  ALTER COLUMN client_number SET DEFAULT nextval('public.clients_client_number_seq'::regclass);
