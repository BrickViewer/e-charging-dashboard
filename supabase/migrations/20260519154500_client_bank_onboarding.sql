-- Replace external customer payment onboarding with first-party bank and invoice details.
-- Bank details are kept in a separate table so internal viewers do not automatically
-- receive IBAN-level access through the broad clients SELECT policy.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS payment_onboarding_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS payment_onboarding_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_onboarding_verified_at timestamptz;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_payment_onboarding_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_payment_onboarding_status_check
  CHECK (payment_onboarding_status IN ('missing', 'pending_review', 'verified', 'rejected'));

CREATE TABLE IF NOT EXISTS public.client_payment_details (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_email text NOT NULL,
  payout_account_holder_name text NOT NULL,
  payout_iban text NOT NULL,
  payout_iban_last4 text NOT NULL,
  payout_bic text,
  account_holder_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending_review',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_payment_details_status_check
    CHECK (status IN ('pending_review', 'verified', 'rejected')),
  CONSTRAINT client_payment_details_invoice_email_check
    CHECK (position('@' in invoice_email) > 1),
  CONSTRAINT client_payment_details_iban_check
    CHECK (payout_iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$'),
  CONSTRAINT client_payment_details_bic_check
    CHECK (payout_bic IS NULL OR payout_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$')
);

ALTER TABLE public.client_payment_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Portal user can view own payment details" ON public.client_payment_details;
DROP POLICY IF EXISTS "Admins and managers can view payment details" ON public.client_payment_details;
DROP POLICY IF EXISTS "Admins and managers can manage payment details" ON public.client_payment_details;

CREATE POLICY "Portal user can view own payment details" ON public.client_payment_details
  FOR SELECT
  USING (client_id = app_private.get_client_id_for_user(auth.uid()));

CREATE POLICY "Admins and managers can view payment details" ON public.client_payment_details
  FOR SELECT
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Admins and managers can manage payment details" ON public.client_payment_details
  FOR ALL
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.submit_client_payment_details(
  p_company_name text,
  p_kvk text,
  p_contact_name text,
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

  IF NOT coalesce(p_account_holder_confirmed, false) THEN
    RAISE EXCEPTION 'Bevestig dat de rekening op naam van de contractpartij staat'
      USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2
    OR length(trim(coalesce(p_contact_name, ''))) < 2
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
    contact_name = trim(p_contact_name),
    contact_phone = nullif(trim(coalesce(p_contact_phone, '')), ''),
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
    'Klant heeft betaal- en factuurgegevens ingediend',
    jsonb_build_object('iban_last4', right(v_iban, 4), 'invoice_email', lower(trim(p_invoice_email)))
  );

  RETURN v_details;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_client_payment_details(
  p_client_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS public.client_payment_details
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_now timestamptz := now();
  v_details public.client_payment_details;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag betaalgegevens beoordelen'
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending_review', 'verified', 'rejected') THEN
    RAISE EXCEPTION 'Ongeldige betaalgegevensstatus'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.client_payment_details
  SET
    status = p_status,
    verified_at = CASE WHEN p_status = 'verified' THEN v_now ELSE NULL END,
    verified_by = CASE WHEN p_status = 'verified' THEN auth.uid() ELSE NULL END,
    rejected_at = CASE WHEN p_status = 'rejected' THEN v_now ELSE NULL END,
    rejection_reason = CASE WHEN p_status = 'rejected' THEN nullif(trim(coalesce(p_rejection_reason, '')), '') ELSE NULL END,
    updated_at = v_now
  WHERE client_id = p_client_id
  RETURNING * INTO v_details;

  IF v_details.client_id IS NULL THEN
    RAISE EXCEPTION 'Betaalgegevens niet gevonden'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.clients
  SET
    payment_onboarding_status = p_status,
    payment_onboarding_verified_at = CASE WHEN p_status = 'verified' THEN v_now ELSE NULL END
  WHERE id = p_client_id;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    p_client_id,
    auth.uid(),
    'payment_details_reviewed',
    CASE
      WHEN p_status = 'verified' THEN 'Betaal- en factuurgegevens goedgekeurd'
      WHEN p_status = 'rejected' THEN 'Betaal- en factuurgegevens afgewezen'
      ELSE 'Betaal- en factuurgegevens teruggezet naar controle'
    END,
    jsonb_build_object('status', p_status, 'rejection_reason', p_rejection_reason)
  );

  RETURN v_details;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_payment_details(text, text, text, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_client_payment_details(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_payment_details(text, text, text, text, text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_client_payment_details(uuid, text, text) TO authenticated;
