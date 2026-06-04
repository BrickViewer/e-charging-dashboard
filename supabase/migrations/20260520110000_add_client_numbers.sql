-- System-wide customer numbers for E-Charging clients.
-- Existing clients are numbered deterministically from 101 by creation order.

CREATE SCHEMA IF NOT EXISTS app_private;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_number integer;

WITH numbered_clients AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at, id) + 100 AS generated_client_number
  FROM public.clients
  WHERE client_number IS NULL
)
UPDATE public.clients AS clients
SET client_number = numbered_clients.generated_client_number
FROM numbered_clients
WHERE clients.id = numbered_clients.id;

CREATE SEQUENCE IF NOT EXISTS public.clients_client_number_seq
  AS integer
  START WITH 101
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

SELECT setval(
  'public.clients_client_number_seq',
  GREATEST((SELECT COALESCE(MAX(client_number), 100) FROM public.clients), 100),
  true
);

CREATE OR REPLACE FUNCTION app_private.assign_client_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.client_number IS NULL THEN
    LOOP
      v_next := nextval('public.clients_client_number_seq');
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.clients
        WHERE client_number = v_next
      );
    END LOOP;

    NEW.client_number := v_next;
  END IF;

  IF NEW.client_number < 101 THEN
    RAISE EXCEPTION 'Klantnummer moet 101 of hoger zijn'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_client_number_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_last_value integer;
  v_max_client_number integer;
BEGIN
  SELECT last_value INTO v_last_value
  FROM public.clients_client_number_seq;

  SELECT COALESCE(MAX(client_number), 100)
  INTO v_max_client_number
  FROM public.clients;

  PERFORM setval(
    'public.clients_client_number_seq',
    GREATEST(v_last_value, v_max_client_number, 100),
    true
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS assign_client_number_before_insert ON public.clients;
CREATE TRIGGER assign_client_number_before_insert
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION app_private.assign_client_number();

DROP TRIGGER IF EXISTS sync_client_number_sequence_after_write ON public.clients;
CREATE TRIGGER sync_client_number_sequence_after_write
  AFTER INSERT OR UPDATE OF client_number ON public.clients
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_private.sync_client_number_sequence();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_client_number_check'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_client_number_check CHECK (client_number >= 101);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_client_number_key'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_client_number_key UNIQUE (client_number);
  END IF;
END;
$$;

ALTER TABLE public.clients
  ALTER COLUMN client_number SET NOT NULL;

REVOKE ALL ON FUNCTION app_private.assign_client_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.sync_client_number_sequence() FROM PUBLIC;
