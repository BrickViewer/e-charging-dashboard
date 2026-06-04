-- Complete security hardening after repo-wide audit:
-- - private RLS helpers are not exposed through the public RPC surface;
-- - invitation tokens are hash-only at rest;
-- - activity logging, payment status, and location assignment are transactional RPCs;
-- - direct authenticated settlement writes are removed;
-- - portal-visible direct table access remains final-only.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS app_private;

GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_internal(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION app_private.get_client_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id
  FROM public.clients
  WHERE portal_user_id = _user_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.get_client_id_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_internal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_client_id_for_user(uuid) TO authenticated;

-- Keep legacy public helpers callable only by privileged DB roles. Policies below use app_private.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_internal(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_client_id_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_id_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_client_id_for_user(uuid) FROM authenticated;

-- Invitation tokens: revoke existing pending plaintext links, then remove plaintext storage.
ALTER TABLE public.client_invitations
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS token_last4 text;

UPDATE public.client_invitations
SET status = 'revoked'
WHERE status = 'pending';

UPDATE public.client_invitations
SET token_hash = encode(extensions.digest(id::text || ':' || COALESCE(token, gen_random_uuid()::text), 'sha256'), 'hex'),
    token_last4 = right(COALESCE(token, ''), 4)
WHERE token_hash IS NULL;

ALTER TABLE public.client_invitations
  ALTER COLUMN token_hash SET NOT NULL;

ALTER TABLE public.client_invitations DROP CONSTRAINT IF EXISTS client_invitations_token_hash_key;
DROP INDEX IF EXISTS client_invitations_token_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS client_invitations_token_hash_key
  ON public.client_invitations(token_hash);

DROP INDEX IF EXISTS client_invitations_one_pending_per_client;
CREATE UNIQUE INDEX IF NOT EXISTS client_invitations_one_pending_per_client
  ON public.client_invitations(client_id)
  WHERE status = 'pending';

ALTER TABLE public.client_invitations
  DROP COLUMN IF EXISTS token;

-- Rebuild RLS policies using private helpers. This also removes older broad policies.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'activity_log',
        'charge_points',
        'charging_sessions',
        'client_invitations',
        'clients',
        'eflux_invoices',
        'eflux_sync_log',
        'eflux_sync_state',
        'locations',
        'notifications',
        'organizations',
        'profiles',
        'quarterly_settlements',
        'quotes',
        'tariff_profiles',
        'user_roles'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarterly_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eflux_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eflux_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eflux_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view organizations" ON public.organizations
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Admins can manage organizations" ON public.organizations
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Internal users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Internal users can view all clients" ON public.clients
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own client" ON public.clients
  FOR SELECT TO authenticated
  USING (portal_user_id = auth.uid());
CREATE POLICY "Admins and managers can manage clients" ON public.clients
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view all locations" ON public.locations
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Internal users can view unlinked locations" ON public.locations
  FOR SELECT TO authenticated
  USING (client_id IS NULL AND app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own locations" ON public.locations
  FOR SELECT TO authenticated
  USING (client_id = app_private.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage locations" ON public.locations
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view all charge points" ON public.charge_points
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own charge points" ON public.charge_points
  FOR SELECT TO authenticated
  USING (
    location_id IN (
      SELECT id
      FROM public.locations
      WHERE client_id = app_private.get_client_id_for_user(auth.uid())
    )
  );
CREATE POLICY "Admins and managers can manage charge points" ON public.charge_points
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view all tariffs" ON public.tariff_profiles
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own tariffs" ON public.tariff_profiles
  FOR SELECT TO authenticated
  USING (client_id = app_private.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage tariffs" ON public.tariff_profiles
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view all sessions" ON public.charging_sessions
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own sessions" ON public.charging_sessions
  FOR SELECT TO authenticated
  USING (client_id = app_private.get_client_id_for_user(auth.uid()));
CREATE POLICY "Admins and managers can manage sessions" ON public.charging_sessions
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view all quarterly settlements" ON public.quarterly_settlements
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Portal user can view own final quarterly settlements" ON public.quarterly_settlements
  FOR SELECT TO authenticated
  USING (
    client_id = app_private.get_client_id_for_user(auth.uid())
    AND status IN ('approved', 'paid', 'charged_back')
  );
CREATE POLICY "Restrict portal quarterly settlement detail to final statuses" ON public.quarterly_settlements
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    app_private.is_internal(auth.uid())
    OR (
      client_id = app_private.get_client_id_for_user(auth.uid())
      AND status IN ('approved', 'paid', 'charged_back')
    )
  );

CREATE POLICY "Internal users can view all quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Admins and managers can manage quotes" ON public.quotes
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Admins and managers can create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );
CREATE POLICY "Restrict notification inserts to admin manager" ON public.notifications
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view activity log" ON public.activity_log
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Admins and managers can create activity log" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );
CREATE POLICY "Restrict activity log inserts to admin manager" ON public.activity_log
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view invitations" ON public.client_invitations
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Admins and managers can manage invitations" ON public.client_invitations
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view sync logs" ON public.eflux_sync_log
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
CREATE POLICY "Admins and managers can manage sync logs" ON public.eflux_sync_log
  FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Internal users can view sync state" ON public.eflux_sync_state
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));

CREATE POLICY "Admins can view eflux invoices" ON public.eflux_invoices
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

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
  estimated_client_yield numeric,
  co2_kg_avoided numeric,
  ere_estimate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.create_activity_log(
  client_id uuid,
  action text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.activity_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.activity_log%ROWTYPE;
  v_organization_id uuid;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag activiteit loggen' USING ERRCODE = '42501';
  END IF;

  IF $1 IS NOT NULL THEN
    SELECT c.organization_id INTO v_organization_id
    FROM public.clients c
    WHERE c.id = $1;
  END IF;

  INSERT INTO public.activity_log (organization_id, client_id, user_id, action, description, metadata)
  VALUES (v_organization_id, $1, auth.uid(), $2, $3, COALESCE($4, '{}'::jsonb))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_activity_log(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_activity_log(uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_settlements(settlement_ids uuid[])
RETURNS TABLE (
  approved_count integer,
  setup_points_marked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_setup_expected integer;
  v_setup_updated integer;
  v_approved integer;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag afrekeningen goedkeuren' USING ERRCODE = '42501';
  END IF;

  v_requested := COALESCE(cardinality(settlement_ids), 0);
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'Geen afrekeningen geselecteerd';
  END IF;

  SELECT COUNT(*) INTO v_found
  FROM public.quarterly_settlements qs
  WHERE qs.id = ANY(settlement_ids);

  IF v_found <> v_requested THEN
    RAISE EXCEPTION 'Een of meer afrekeningen bestaan niet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
      AND qs.status <> 'calculated'
  ) THEN
    RAISE EXCEPTION 'Alleen berekende afrekeningen kunnen worden goedgekeurd';
  END IF;

  SELECT COALESCE(SUM(cardinality(COALESCE(qs.eflux_setup_fee_paal_ids, ARRAY[]::uuid[]))), 0)::integer
  INTO v_setup_expected
  FROM public.quarterly_settlements qs
  WHERE qs.id = ANY(settlement_ids);

  WITH selected AS (
    SELECT
      qs.id,
      qs.period_end,
      COALESCE(qs.eflux_setup_fee_paal_ids, ARRAY[]::uuid[]) AS paal_ids,
      COALESCE(qs.eflux_setup_ac_rate, 16.50) AS eflux_setup_ac_rate,
      COALESCE(qs.eflux_setup_dc_rate, 22.18) AS eflux_setup_dc_rate
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
    FOR UPDATE
  ),
  setup_points AS (
    SELECT
      cp.id,
      cp.type,
      cp.num_connectors,
      selected.period_end,
      selected.eflux_setup_ac_rate,
      selected.eflux_setup_dc_rate
    FROM selected
    CROSS JOIN LATERAL unnest(selected.paal_ids) AS paal_id(id)
    JOIN public.charge_points cp ON cp.id = paal_id.id
  )
  UPDATE public.charge_points cp
  SET
    setup_fee_charged_at = ((setup_points.period_end::date + 1)::timestamptz - interval '1 second'),
    setup_fee_amount = (
      CASE
        WHEN lower(COALESCE(setup_points.type, '')) = 'dc' THEN setup_points.eflux_setup_dc_rate
        ELSE setup_points.eflux_setup_ac_rate
      END
      * GREATEST(COALESCE(setup_points.num_connectors, 1), 1)
    ),
    updated_at = now()
  FROM setup_points
  WHERE cp.id = setup_points.id;

  GET DIAGNOSTICS v_setup_updated = ROW_COUNT;

  IF v_setup_updated <> v_setup_expected THEN
    RAISE EXCEPTION 'Niet alle setup-fee palen konden worden gemarkeerd';
  END IF;

  UPDATE public.quarterly_settlements qs
  SET status = 'approved', updated_at = now()
  WHERE qs.id = ANY(settlement_ids)
    AND qs.status = 'calculated';

  GET DIAGNOSTICS v_approved = ROW_COUNT;

  RETURN QUERY SELECT v_approved, v_setup_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_settlements(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_settlements(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_settlements_paid(settlement_ids uuid[])
RETURNS TABLE (paid_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_paid integer;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag afrekeningen als betaald markeren' USING ERRCODE = '42501';
  END IF;

  v_requested := COALESCE(cardinality(settlement_ids), 0);
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'Geen afrekeningen geselecteerd';
  END IF;

  WITH selected AS (
    SELECT qs.id, qs.status
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
    FOR UPDATE
  )
  SELECT COUNT(*) INTO v_found
  FROM selected;

  IF v_found <> v_requested THEN
    RAISE EXCEPTION 'Een of meer afrekeningen bestaan niet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
      AND qs.status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'Alleen goedgekeurde afrekeningen kunnen als betaald worden gemarkeerd';
  END IF;

  UPDATE public.quarterly_settlements qs
  SET status = 'paid',
      paid_at = now(),
      updated_at = now()
  WHERE qs.id = ANY(settlement_ids)
    AND qs.status = 'approved';

  GET DIAGNOSTICS v_paid = ROW_COUNT;

  RETURN QUERY SELECT v_paid;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_settlements_paid(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_settlements_paid(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_direct_location_client_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.client_id IS DISTINCT FROM NEW.client_id
    AND COALESCE(current_setting('app.allow_location_client_change', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Klantkoppeling van locaties mag alleen via set_location_client() worden gewijzigd'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_direct_location_client_change ON public.locations;
CREATE TRIGGER prevent_direct_location_client_change
  BEFORE UPDATE OF client_id ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_location_client_change();

CREATE OR REPLACE FUNCTION public.set_location_client(location_id uuid, client_id uuid)
RETURNS public.locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location public.locations%ROWTYPE;
  v_previous_client_id uuid;
  v_action text;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag locaties koppelen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_location
  FROM public.locations l
  WHERE l.id = $1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Locatie niet gevonden';
  END IF;

  IF $2 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = $2) THEN
    RAISE EXCEPTION 'Klant niet gevonden';
  END IF;

  v_previous_client_id := v_location.client_id;

  PERFORM set_config('app.allow_location_client_change', 'on', true);

  UPDATE public.locations l
  SET
    client_id = $2,
    client_assigned_at = CASE
      WHEN $2 IS NULL THEN NULL
      WHEN v_previous_client_id IS DISTINCT FROM $2 THEN now()
      ELSE l.client_assigned_at
    END,
    updated_at = now()
  WHERE l.id = $1
  RETURNING * INTO v_location;

  IF $2 IS NOT NULL THEN
    UPDATE public.charging_sessions cs
    SET client_id = $2,
        updated_at = now()
    WHERE cs.location_id = $1
      AND cs.client_id IS NULL;
  END IF;

  v_action := CASE WHEN $2 IS NULL THEN 'location_unlinked' ELSE 'location_linked' END;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    COALESCE($2, v_previous_client_id),
    auth.uid(),
    v_action,
    CASE WHEN $2 IS NULL THEN 'Locatie ontkoppeld' ELSE 'Locatie gekoppeld aan klant' END,
    jsonb_build_object('location_id', $1, 'previous_client_id', v_previous_client_id, 'client_id', $2)
  );

  RETURN v_location;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_client(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_client_invitation(invitation_token_hash text, accepted_user_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  client_id uuid,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation public.client_invitations%ROWTYPE;
  v_updated integer;
BEGIN
  SELECT ci.* INTO v_invitation
  FROM public.client_invitations ci
  WHERE ci.token_hash = $1
    AND ci.status = 'pending'
    AND ci.expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Uitnodiging niet geldig of verlopen' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.clients c
  SET portal_user_id = $2,
      updated_at = now()
  WHERE c.id = v_invitation.client_id
    AND c.portal_user_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Klant heeft al een actief portal-account' USING ERRCODE = '23505';
  END IF;

  UPDATE public.client_invitations ci
  SET status = 'accepted',
      accepted_at = now()
  WHERE ci.id = v_invitation.id;

  UPDATE public.client_invitations ci
  SET status = 'revoked'
  WHERE ci.client_id = v_invitation.client_id
    AND ci.status = 'pending'
    AND ci.id <> v_invitation.id;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_invitation.client_id,
    $2,
    'invitation_accepted',
    'Klant heeft uitnodiging geaccepteerd en account aangemaakt',
    jsonb_build_object('invitation_id', v_invitation.id, 'email', v_invitation.email)
  );

  RETURN QUERY SELECT v_invitation.id, v_invitation.client_id, v_invitation.email;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_client_invitation(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_client_invitation(text, uuid) TO service_role;
