-- Klantprofiel verwijderen: klantnummers opnieuw beschikbaar maken voor nieuwe klanten.

ALTER TABLE public.clients
  ALTER COLUMN client_number DROP NOT NULL,
  ALTER COLUMN client_number DROP DEFAULT;

DROP TRIGGER IF EXISTS sync_client_number_sequence_after_write ON public.clients;
DROP FUNCTION IF EXISTS app_private.sync_client_number_sequence();

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_client_number_key,
  DROP CONSTRAINT IF EXISTS clients_client_number_check;

UPDATE public.clients
SET
  company_name = 'Verwijderd klantprofiel',
  client_number = NULL,
  updated_at = now()
WHERE status = 'verwijderd';

CREATE UNIQUE INDEX IF NOT EXISTS clients_client_number_active_key
  ON public.clients(client_number)
  WHERE COALESCE(status, 'actief') <> 'verwijderd';

ALTER TABLE public.clients
  ADD CONSTRAINT clients_client_number_active_check
  CHECK (
    (status = 'verwijderd' AND client_number IS NULL)
    OR (COALESCE(status, 'actief') <> 'verwijderd' AND client_number >= 101)
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
  IF NEW.status = 'verwijderd' THEN
    NEW.client_number := NULL;
    RETURN NEW;
  END IF;

  IF NEW.client_number IS NULL THEN
    SELECT number_candidate
    INTO v_next
    FROM generate_series(
      101,
      (
        SELECT GREATEST(
          101,
          COALESCE(MAX(client_number), 100) + 1
        )
        FROM public.clients
        WHERE COALESCE(status, 'actief') <> 'verwijderd'
      )
    ) AS number_candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.clients AS existing_client
      WHERE existing_client.client_number = number_candidate
        AND COALESCE(existing_client.status, 'actief') <> 'verwijderd'
        AND existing_client.id IS DISTINCT FROM NEW.id
    )
    ORDER BY number_candidate
    LIMIT 1;

    NEW.client_number := v_next;
  END IF;

  IF NEW.client_number IS NULL OR NEW.client_number < 101 THEN
    RAISE EXCEPTION 'Klantnummer moet 101 of hoger zijn'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clients AS existing_client
    WHERE existing_client.client_number = NEW.client_number
      AND COALESCE(existing_client.status, 'actief') <> 'verwijderd'
      AND existing_client.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Dit klantnummer is al in gebruik'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_client_number_before_insert ON public.clients;
CREATE TRIGGER assign_client_number_before_insert
  BEFORE INSERT OR UPDATE OF client_number, status ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION app_private.assign_client_number();

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
  v_erased_label text := 'Verwijderd klantprofiel';
  v_payment_details_deleted integer := 0;
  v_invitations_deleted integer := 0;
  v_locations_unlinked integer := 0;
  v_tariff_profiles_deleted integer := 0;
  v_quotes_scrubbed integer := 0;
  v_activity_log_scrubbed integer := 0;
  v_notifications_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_reason text := left(trim(COALESCE(NULLIF(p_reason, ''), 'Klantprofiel verwijderd via admin')), 1000);
BEGIN
  IF p_performed_by IS NULL
    OR NOT app_private.has_role(p_performed_by, 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Alleen admins mogen klantprofielen verwijderen'
      USING ERRCODE = '42501';
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
      'deleted_profile', true,
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
    client_number = NULL,
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
    'client_profile_deleted',
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

REVOKE ALL ON FUNCTION app_private.assign_client_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.prevent_direct_client_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_client_for_privacy(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erase_client_for_privacy(uuid, text, uuid) TO service_role;
