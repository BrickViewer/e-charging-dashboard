-- Harden client portal profile data:
-- - portal users no longer SELECT full bank details directly
-- - company/contact/invoice details can be saved without resubmitting IBAN
-- - bank details require a separate privileged server path
-- - IBAN checksum validation is enforced in Postgres too

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_payment_onboarding_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_payment_onboarding_status_check
  CHECK (payment_onboarding_status IN ('missing', 'saved', 'needs_review'));

ALTER TABLE public.client_payment_details DROP CONSTRAINT IF EXISTS client_payment_details_status_check;
ALTER TABLE public.client_payment_details DROP CONSTRAINT IF EXISTS client_payment_details_iban_check;
ALTER TABLE public.client_payment_details DROP CONSTRAINT IF EXISTS client_payment_details_bic_check;

ALTER TABLE public.client_payment_details
  ALTER COLUMN payout_account_holder_name DROP NOT NULL,
  ALTER COLUMN payout_iban DROP NOT NULL,
  ALTER COLUMN payout_iban_last4 DROP NOT NULL;

CREATE OR REPLACE FUNCTION app_private.is_valid_iban(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_iban text;
  v_rearranged text;
  v_char text;
  v_digits text;
  v_digit text;
  v_remainder integer := 0;
  i integer;
  j integer;
BEGIN
  v_iban := upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g'));

  IF v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' THEN
    RETURN false;
  END IF;

  v_rearranged := substring(v_iban from 5) || substring(v_iban from 1 for 4);

  FOR i IN 1..char_length(v_rearranged) LOOP
    v_char := substring(v_rearranged from i for 1);
    IF v_char ~ '^[A-Z]$' THEN
      v_digits := (ascii(v_char) - 55)::text;
    ELSE
      v_digits := v_char;
    END IF;

    FOR j IN 1..char_length(v_digits) LOOP
      v_digit := substring(v_digits from j for 1);
      v_remainder := (v_remainder * 10 + v_digit::integer) % 97;
    END LOOP;
  END LOOP;

  RETURN v_remainder = 1;
END;
$$;

ALTER TABLE public.client_payment_details
  ADD CONSTRAINT client_payment_details_status_check
  CHECK (status IN ('missing', 'saved', 'needs_review')),
  ADD CONSTRAINT client_payment_details_iban_check
  CHECK (
    payout_iban IS NULL
    OR (
      payout_iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'
      AND app_private.is_valid_iban(payout_iban)
    )
  ),
  ADD CONSTRAINT client_payment_details_bic_check
  CHECK (
    payout_bic IS NULL
    OR payout_bic ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'
  );

DROP POLICY IF EXISTS "Portal user can view own payment details" ON public.client_payment_details;

DROP FUNCTION IF EXISTS public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean
);
DROP FUNCTION IF EXISTS public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
);
DROP FUNCTION IF EXISTS public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.get_portal_payment_details()
RETURNS TABLE (
  client_id uuid,
  invoice_email text,
  payout_account_holder_name text,
  payout_iban_masked text,
  payout_iban_last4 text,
  payout_bic text,
  account_holder_confirmed boolean,
  status text,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());

  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.client_id,
    d.invoice_email,
    d.payout_account_holder_name,
    CASE
      WHEN d.payout_iban_last4 IS NULL THEN NULL
      ELSE '•••• ' || d.payout_iban_last4
    END AS payout_iban_masked,
    d.payout_iban_last4,
    d.payout_bic,
    d.account_holder_confirmed,
    d.status,
    d.updated_at
  FROM public.client_payment_details d
  WHERE d.client_id = v_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_portal_company_details(
  p_company_name text,
  p_kvk text,
  p_btw_number text,
  p_contact_first_name text,
  p_contact_last_name text,
  p_contact_email text,
  p_contact_country_code text,
  p_contact_phone text,
  p_billing_address_street text,
  p_billing_address_postal text,
  p_billing_address_city text,
  p_invoice_email text,
  p_calculate_ere_enabled boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_client_id uuid;
  v_btw text;
  v_contact_first_name text;
  v_contact_last_name text;
  v_contact_email text;
  v_contact_country_code text;
  v_contact_phone_digits text;
  v_kvk text;
  v_billing_postal text;
  v_invoice_email text;
  v_existing_iban text;
  v_now timestamptz := now();
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Geen klantportaal gekoppeld aan deze gebruiker'
      USING ERRCODE = '42501';
  END IF;

  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '[\s\.-]+', '', 'g')), '');
  v_kvk := regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g');
  v_billing_postal := upper(regexp_replace(trim(coalesce(p_billing_address_postal, '')), '\s+', '', 'g'));
  v_invoice_email := lower(trim(coalesce(p_invoice_email, '')));
  v_contact_first_name := trim(coalesce(p_contact_first_name, ''));
  v_contact_last_name := trim(coalesce(p_contact_last_name, ''));
  v_contact_email := lower(trim(coalesce(p_contact_email, '')));
  v_contact_country_code := trim(coalesce(p_contact_country_code, '+31'));
  v_contact_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');

  IF v_contact_country_code IN ('31', 'NL+31', 'NL +31') THEN
    v_contact_country_code := '+31';
  END IF;

  IF left(v_contact_phone_digits, 4) = '0031' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 5);
  ELSIF left(v_contact_phone_digits, 2) = '31' AND length(v_contact_phone_digits) > 9 THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 3);
  END IF;

  IF left(v_contact_phone_digits, 1) = '0' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 2);
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Bedrijfsnaam is verplicht'
      USING ERRCODE = '22023';
  END IF;

  IF v_kvk !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'KvK-nummer moet uit 8 cijfers bestaan'
      USING ERRCODE = '22023';
  END IF;

  IF v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' THEN
    RAISE EXCEPTION 'BTW-nummer heeft geen geldig formaat'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_contact_first_name) < 2
    OR length(v_contact_last_name) < 2
    OR position('@' in v_contact_email) <= 1
    OR v_contact_country_code <> '+31'
    OR v_contact_phone_digits !~ '^[1-9][0-9]{8}$'
  THEN
    RAISE EXCEPTION 'Controleer de contactpersoon gegevens'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_billing_address_street, ''))) < 3
    OR v_billing_postal !~ '^[1-9][0-9]{3}[A-Z]{2}$'
    OR length(trim(coalesce(p_billing_address_city, ''))) < 2
  THEN
    RAISE EXCEPTION 'Controleer het factuuradres'
      USING ERRCODE = '22023';
  END IF;

  IF position('@' in v_invoice_email) <= 1 THEN
    RAISE EXCEPTION 'Factuurmail heeft geen geldig formaat'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.payout_iban
  INTO v_existing_iban
  FROM public.client_payment_details d
  WHERE d.client_id = v_client_id;

  UPDATE public.clients
  SET
    company_name = trim(p_company_name),
    kvk = v_kvk,
    btw_number = v_btw,
    contact_name = v_contact_first_name || ' ' || v_contact_last_name,
    contact_email = v_contact_email,
    contact_phone = v_contact_country_code || v_contact_phone_digits,
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = v_billing_postal,
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', '
      || v_billing_postal || ' '
      || trim(p_billing_address_city),
    calculate_ere_enabled = coalesce(p_calculate_ere_enabled, false),
    payment_onboarding_status = CASE
      WHEN v_existing_iban IS NULL THEN 'missing'
      ELSE payment_onboarding_status
    END
  WHERE id = v_client_id;

  INSERT INTO public.client_payment_details (
    client_id,
    invoice_email,
    account_holder_confirmed,
    status,
    submitted_at,
    updated_at
  )
  VALUES (
    v_client_id,
    v_invoice_email,
    false,
    'missing',
    v_now,
    v_now
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    invoice_email = EXCLUDED.invoice_email,
    status = CASE
      WHEN public.client_payment_details.payout_iban IS NULL THEN 'missing'
      ELSE public.client_payment_details.status
    END,
    updated_at = v_now;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_client_id,
    auth.uid(),
    'client_company_details_saved',
    'Klant heeft bedrijfs-, contact- en factuurgegevens opgeslagen',
    jsonb_build_object(
      'invoice_email', v_invoice_email,
      'contact_email', v_contact_email,
      'btw_number', v_btw,
      'calculate_ere_enabled', coalesce(p_calculate_ere_enabled, false)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.is_valid_iban(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_payment_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_portal_company_details(
  text, text, text, text, text, text, text, text, text, text, text, text, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_portal_payment_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_portal_company_details(
  text, text, text, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;
