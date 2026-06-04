ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS calculate_ere_enabled boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.get_portal_dashboard_kpis();

CREATE OR REPLACE FUNCTION public.get_portal_dashboard_kpis()
RETURNS TABLE (
  year integer,
  quarter integer,
  period_start date,
  period_end date,
  status text,
  is_final boolean,
  total_kwh numeric,
  gross_revenue numeric,
  total_energy_cost numeric,
  total_customer_cashflow numeric,
  estimated_client_yield numeric,
  co2_kg_avoided numeric,
  ere_estimate numeric
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
    qs.year,
    qs.quarter,
    qs.period_start::date,
    qs.period_end::date,
    qs.status::text,
    (qs.status IN ('approved', 'paid', 'charged_back')) AS is_final,
    COALESCE(qs.total_kwh, 0)::numeric AS total_kwh,
    COALESCE(qs.gross_revenue, 0)::numeric AS gross_revenue,
    COALESCE(qs.total_energy_cost, 0)::numeric AS total_energy_cost,
    (COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0))::numeric AS total_customer_cashflow,
    COALESCE(qs.client_payout, 0)::numeric AS estimated_client_yield,
    (COALESCE(qs.total_kwh, 0)::numeric * 0.306)::numeric AS co2_kg_avoided,
    COALESCE(qs.ere_estimate, 0)::numeric AS ere_estimate
  FROM public.quarterly_settlements qs
  WHERE qs.client_id = v_client_id
  ORDER BY qs.year DESC, qs.quarter DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_dashboard_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard_kpis() TO authenticated;

DROP FUNCTION IF EXISTS public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
);

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
  p_account_holder_confirmed boolean DEFAULT false,
  p_calculate_ere_enabled boolean DEFAULT false
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
  v_kvk text;
  v_billing_postal text;
  v_invoice_email text;
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

  IF NOT coalesce(p_account_holder_confirmed, false) THEN
    RAISE EXCEPTION 'Bevestig dat de rekening op naam van de contractpartij staat'
      USING ERRCODE = '22023';
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

  IF length(trim(coalesce(p_payout_account_holder_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Naam rekeninghouder is verplicht'
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
    v_invoice_email,
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
      'invoice_email', v_invoice_email,
      'contact_email', v_contact_email,
      'btw_number', v_btw,
      'calculate_ere_enabled', coalesce(p_calculate_ere_enabled, false)
    )
  );

  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_payment_details(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean
) TO authenticated;
