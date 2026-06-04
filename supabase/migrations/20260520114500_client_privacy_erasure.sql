-- Klantprofiel verwijderen: persoonsgegevens wissen, administratieve historie behouden.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS erased_at timestamptz,
  ADD COLUMN IF NOT EXISTS erased_by uuid,
  ADD COLUMN IF NOT EXISTS erasure_reason text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status = ANY (ARRAY['actief'::text, 'inactief'::text, 'verwijderd'::text]));

CREATE TABLE IF NOT EXISTS public.client_erasure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_number integer NOT NULL,
  erased_client_label text NOT NULL,
  performed_by uuid,
  reason text NOT NULL,
  payment_details_deleted integer NOT NULL DEFAULT 0,
  invitations_deleted integer NOT NULL DEFAULT 0,
  locations_unlinked integer NOT NULL DEFAULT 0,
  tariff_profiles_deleted integer NOT NULL DEFAULT 0,
  quotes_scrubbed integer NOT NULL DEFAULT 0,
  activity_log_scrubbed integer NOT NULL DEFAULT 0,
  notifications_deleted integer NOT NULL DEFAULT 0,
  profiles_deleted integer NOT NULL DEFAULT 0,
  auth_user_deleted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_erasure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal users can view client erasure log" ON public.client_erasure_log;
CREATE POLICY "Internal users can view client erasure log"
  ON public.client_erasure_log
  FOR SELECT
  TO authenticated
  USING (app_private.is_internal(auth.uid()));

DROP POLICY IF EXISTS "Admins can create client erasure log" ON public.client_erasure_log;
CREATE POLICY "Admins can create client erasure log"
  ON public.client_erasure_log
  FOR INSERT
  TO authenticated
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

GRANT SELECT ON public.client_erasure_log TO authenticated;

CREATE INDEX IF NOT EXISTS client_erasure_log_client_id_idx
  ON public.client_erasure_log(client_id);

CREATE INDEX IF NOT EXISTS client_erasure_log_client_number_idx
  ON public.client_erasure_log(client_number);

CREATE OR REPLACE FUNCTION app_private.prevent_direct_client_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, app_private
AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_client_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Klanten mogen niet direct worden verwijderd. Gebruik klantprofiel verwijderen.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_client_delete ON public.clients;
CREATE TRIGGER prevent_direct_client_delete
  BEFORE DELETE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION app_private.prevent_direct_client_delete();

REVOKE ALL ON FUNCTION app_private.prevent_direct_client_delete() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.erase_client_for_privacy(
  p_client_id uuid,
  p_reason text,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, app_private
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_portal_user_id uuid;
  v_erased_label text;
  v_payment_details_deleted integer := 0;
  v_invitations_deleted integer := 0;
  v_locations_unlinked integer := 0;
  v_tariff_profiles_deleted integer := 0;
  v_quotes_scrubbed integer := 0;
  v_activity_log_scrubbed integer := 0;
  v_notifications_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_reason text := left(trim(COALESCE(p_reason, '')), 1000);
BEGIN
  IF p_performed_by IS NULL
    OR NOT app_private.has_role(p_performed_by, 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Alleen admins mogen klantprofielen verwijderen'
      USING ERRCODE = '42501';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reden is verplicht'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_client
  FROM public.clients
  WHERE id = p_client_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klant niet gevonden'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_client.status = 'verwijderd' THEN
    RAISE EXCEPTION 'Klantprofiel is al verwijderd'
      USING ERRCODE = '23505';
  END IF;

  v_portal_user_id := v_client.portal_user_id;
  v_erased_label := format('Verwijderde klant #%s', v_client.client_number);

  DELETE FROM public.client_payment_details
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_payment_details_deleted = ROW_COUNT;

  DELETE FROM public.client_invitations
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_invitations_deleted = ROW_COUNT;

  DELETE FROM public.tariff_profiles
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_tariff_profiles_deleted = ROW_COUNT;

  IF v_portal_user_id IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE recipient_id = v_portal_user_id;
    GET DIAGNOSTICS v_notifications_deleted = ROW_COUNT;

    DELETE FROM public.profiles
    WHERE user_id = v_portal_user_id;
    GET DIAGNOSTICS v_profiles_deleted = ROW_COUNT;

    UPDATE public.activity_log
    SET user_id = NULL
    WHERE user_id = v_portal_user_id;
  END IF;

  UPDATE public.quotes
  SET
    prospect_company = v_erased_label,
    prospect_contact = NULL,
    prospect_email = NULL,
    locations_data = NULL,
    calculation_snapshot = NULL,
    notes = NULL,
    updated_at = now()
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_quotes_scrubbed = ROW_COUNT;

  UPDATE public.activity_log
  SET
    description = 'Historische klantactiviteit geanonimiseerd',
    details = NULL,
    metadata = jsonb_build_object(
      'erased', true,
      'client_number', v_client.client_number
    )
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_activity_log_scrubbed = ROW_COUNT;

  PERFORM set_config('app.allow_location_client_change', 'on', true);

  UPDATE public.locations
  SET
    client_id = NULL,
    client_assigned_at = NULL,
    updated_at = now()
  WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_locations_unlinked = ROW_COUNT;

  UPDATE public.clients
  SET
    company_name = v_erased_label,
    kvk = NULL,
    btw_number = NULL,
    contact_name = NULL,
    contact_email = NULL,
    contact_phone = NULL,
    billing_address = NULL,
    billing_address_street = NULL,
    billing_address_postal = NULL,
    billing_address_city = NULL,
    contract_start_date = NULL,
    contract_duration_months = NULL,
    revenue_share_percentage = NULL,
    charge_rate_per_kwh = NULL,
    energy_cost_per_kwh = NULL,
    ere_rate_per_kwh = NULL,
    monthly_platform_surcharge = 0,
    auto_renew = false,
    notice_period_months = 0,
    eflux_account_id = NULL,
    notes = NULL,
    portal_user_id = NULL,
    payment_onboarding_status = 'missing',
    payment_onboarding_submitted_at = NULL,
    payment_onboarding_verified_at = NULL,
    calculate_ere_enabled = false,
    status = 'verwijderd',
    erased_at = now(),
    erased_by = p_performed_by,
    erasure_reason = v_reason,
    updated_at = now()
  WHERE id = p_client_id;

  INSERT INTO public.client_erasure_log (
    client_id,
    client_number,
    erased_client_label,
    performed_by,
    reason,
    payment_details_deleted,
    invitations_deleted,
    locations_unlinked,
    tariff_profiles_deleted,
    quotes_scrubbed,
    activity_log_scrubbed,
    notifications_deleted,
    profiles_deleted,
    metadata
  )
  VALUES (
    p_client_id,
    v_client.client_number,
    v_erased_label,
    p_performed_by,
    v_reason,
    v_payment_details_deleted,
    v_invitations_deleted,
    v_locations_unlinked,
    v_tariff_profiles_deleted,
    v_quotes_scrubbed,
    v_activity_log_scrubbed,
    v_notifications_deleted,
    v_profiles_deleted,
    jsonb_build_object(
      'portal_user_removed', v_portal_user_id IS NOT NULL,
      'previous_status', v_client.status
    )
  );

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    p_client_id,
    p_performed_by,
    'client_erased',
    'Klantprofiel verwijderd',
    jsonb_build_object(
      'client_number', v_client.client_number,
      'locations_unlinked', v_locations_unlinked,
      'payment_details_deleted', v_payment_details_deleted
    )
  );

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'client_number', v_client.client_number,
    'erased_client_label', v_erased_label,
    'portal_user_id', v_portal_user_id,
    'counts', jsonb_build_object(
      'payment_details_deleted', v_payment_details_deleted,
      'invitations_deleted', v_invitations_deleted,
      'locations_unlinked', v_locations_unlinked,
      'tariff_profiles_deleted', v_tariff_profiles_deleted,
      'quotes_scrubbed', v_quotes_scrubbed,
      'activity_log_scrubbed', v_activity_log_scrubbed,
      'notifications_deleted', v_notifications_deleted,
      'profiles_deleted', v_profiles_deleted
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erase_client_for_privacy(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_client_for_privacy(uuid, text, uuid) TO service_role;
