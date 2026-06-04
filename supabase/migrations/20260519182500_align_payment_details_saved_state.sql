-- Align backend state with the current portal/admin UI:
-- client details are either missing or saved. There is no hidden review phase.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_payment_onboarding_status_check;
ALTER TABLE public.client_payment_details DROP CONSTRAINT IF EXISTS client_payment_details_status_check;

UPDATE public.client_payment_details
SET
  status = 'saved',
  verified_at = NULL,
  verified_by = NULL,
  rejected_at = NULL,
  rejection_reason = NULL,
  updated_at = now()
WHERE status IS DISTINCT FROM 'saved'
   OR verified_at IS NOT NULL
   OR verified_by IS NOT NULL
   OR rejected_at IS NOT NULL
   OR rejection_reason IS NOT NULL;

UPDATE public.clients c
SET
  payment_onboarding_status = CASE
    WHEN d.client_id IS NULL THEN 'missing'
    ELSE 'saved'
  END,
  payment_onboarding_verified_at = NULL
FROM public.clients c2
LEFT JOIN public.client_payment_details d ON d.client_id = c2.id
WHERE c.id = c2.id
  AND (
    c.payment_onboarding_status IS DISTINCT FROM CASE WHEN d.client_id IS NULL THEN 'missing' ELSE 'saved' END
    OR c.payment_onboarding_verified_at IS NOT NULL
  );

ALTER TABLE public.clients
  ADD CONSTRAINT clients_payment_onboarding_status_check
  CHECK (payment_onboarding_status IN ('missing', 'saved'));

ALTER TABLE public.client_payment_details
  ADD CONSTRAINT client_payment_details_status_check
  CHECK (status IN ('saved'));

DROP FUNCTION IF EXISTS public.review_client_payment_details(uuid, text, text);

CREATE OR REPLACE FUNCTION public.submit_client_payment_details(
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
  p_payout_account_holder_name text,
  p_payout_iban text,
  p_payout_bic text DEFAULT NULL,
  p_account_holder_confirmed boolean DEFAULT false
)
RETURNS public.client_payment_details
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_client_id uuid;
  v_iban text;
  v_bic text;
  v_btw text;
  v_contact_first_name text;
  v_contact_last_name text;
  v_contact_email text;
  v_contact_country_code text;
  v_contact_phone_digits text;
  v_now timestamptz := now();
  v_details public.client_payment_details;
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Geen klantportaal gekoppeld aan deze gebruiker'
      USING ERRCODE = '42501';
  END IF;

  v_iban := upper(regexp_replace(coalesce(p_payout_iban, ''), '\s+', '', 'g'));
  v_bic := nullif(upper(regexp_replace(coalesce(p_payout_bic, ''), '\s+', '', 'g')), '');
  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '[\s\.-]+', '', 'g')), '');
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

  IF NOT coalesce(p_account_holder_confirmed, false) THEN
    RAISE EXCEPTION 'Bevestig dat de rekening op naam van de contractpartij staat'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2
    OR length(trim(coalesce(p_kvk, ''))) < 6
    OR length(trim(coalesce(v_btw, ''))) < 5
    OR length(v_contact_first_name) < 2
    OR length(v_contact_last_name) < 2
    OR position('@' in v_contact_email) <= 1
    OR v_contact_country_code <> '+31'
    OR v_contact_phone_digits !~ '^[1-9][0-9]{8}$'
    OR length(trim(coalesce(p_billing_address_street, ''))) < 3
    OR length(trim(coalesce(p_billing_address_postal, ''))) < 4
    OR length(trim(coalesce(p_billing_address_city, ''))) < 2
    OR position('@' in coalesce(p_invoice_email, '')) <= 1
    OR length(trim(coalesce(p_payout_account_holder_name, ''))) < 2
  THEN
    RAISE EXCEPTION 'Vul alle verplichte bedrijfs-, contact-, factuur- en bankgegevens in'
      USING ERRCODE = '22023';
  END IF;

  IF v_iban !~ '^[A-Z]{2}[0-9A-Z]{13,32}$' THEN
    RAISE EXCEPTION 'IBAN heeft geen geldig formaat'
      USING ERRCODE = '22023';
  END IF;

  IF v_bic IS NOT NULL AND v_bic !~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$' THEN
    RAISE EXCEPTION 'BIC heeft geen geldig formaat'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.clients
  SET
    company_name = trim(p_company_name),
    kvk = nullif(trim(coalesce(p_kvk, '')), ''),
    btw_number = v_btw,
    contact_name = v_contact_first_name || ' ' || v_contact_last_name,
    contact_email = v_contact_email,
    contact_phone = v_contact_country_code || v_contact_phone_digits,
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = upper(regexp_replace(trim(p_billing_address_postal), '\s+', '', 'g')),
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', '
      || upper(regexp_replace(trim(p_billing_address_postal), '\s+', '', 'g')) || ' '
      || trim(p_billing_address_city),
    payment_onboarding_status = 'saved',
    payment_onboarding_submitted_at = v_now,
    payment_onboarding_verified_at = NULL
  WHERE id = v_client_id;

  INSERT INTO public.client_payment_details (
    client_id,
    invoice_email,
    payout_account_holder_name,
    payout_iban,
    payout_iban_last4,
    payout_bic,
    account_holder_confirmed,
    status,
    submitted_at,
    verified_at,
    verified_by,
    rejected_at,
    rejection_reason,
    updated_at
  )
  VALUES (
    v_client_id,
    lower(trim(p_invoice_email)),
    trim(p_payout_account_holder_name),
    v_iban,
    right(v_iban, 4),
    v_bic,
    true,
    'saved',
    v_now,
    NULL,
    NULL,
    NULL,
    NULL,
    v_now
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    invoice_email = EXCLUDED.invoice_email,
    payout_account_holder_name = EXCLUDED.payout_account_holder_name,
    payout_iban = EXCLUDED.payout_iban,
    payout_iban_last4 = EXCLUDED.payout_iban_last4,
    payout_bic = EXCLUDED.payout_bic,
    account_holder_confirmed = true,
    status = 'saved',
    submitted_at = v_now,
    verified_at = NULL,
    verified_by = NULL,
    rejected_at = NULL,
    rejection_reason = NULL,
    updated_at = v_now
  RETURNING * INTO v_details;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_client_id,
    auth.uid(),
    'client_details_saved',
    'Klant heeft bedrijfs-, contact-, betaal- en factuurgegevens opgeslagen',
    jsonb_build_object(
      'iban_last4', right(v_iban, 4),
      'invoice_email', lower(trim(p_invoice_email)),
      'contact_email', v_contact_email,
      'btw_number', v_btw
    )
  );

  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;
