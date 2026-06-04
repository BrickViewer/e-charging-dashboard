-- Move portal onboarding toward company/facturation data instead of personal contact data.
-- The portal user can update company, VAT, billing address and payout details.

DROP FUNCTION IF EXISTS public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.submit_client_payment_details(
  p_company_name text,
  p_kvk text,
  p_btw_number text,
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
  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '\s+', '', 'g')), '');

  IF NOT coalesce(p_account_holder_confirmed, false) THEN
    RAISE EXCEPTION 'Bevestig dat de rekening op naam van de contractpartij staat'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2
    OR length(trim(coalesce(p_kvk, ''))) < 6
    OR length(trim(coalesce(v_btw, ''))) < 5
    OR length(trim(coalesce(p_billing_address_street, ''))) < 3
    OR length(trim(coalesce(p_billing_address_postal, ''))) < 4
    OR length(trim(coalesce(p_billing_address_city, ''))) < 2
    OR position('@' in coalesce(p_invoice_email, '')) <= 1
    OR length(trim(coalesce(p_payout_account_holder_name, ''))) < 2
  THEN
    RAISE EXCEPTION 'Vul alle verplichte bedrijfs-, factuur- en bankgegevens in'
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
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = upper(regexp_replace(trim(p_billing_address_postal), '\s+', '', 'g')),
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', '
      || upper(regexp_replace(trim(p_billing_address_postal), '\s+', '', 'g')) || ' '
      || trim(p_billing_address_city),
    payment_onboarding_status = 'pending_review',
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
    'pending_review',
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
    status = 'pending_review',
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
    'payment_details_submitted',
    'Klant heeft bedrijfs-, betaal- en factuurgegevens ingediend',
    jsonb_build_object(
      'iban_last4', right(v_iban, 4),
      'invoice_email', lower(trim(p_invoice_email)),
      'btw_number', v_btw
    )
  );

  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, boolean
) TO authenticated;
