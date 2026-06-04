-- Security hardening:
-- - Portal users see only final settlement rows through direct table access.
-- - /portal gets live, safe dashboard KPIs through a narrow RPC.
-- - Settlement approval is transactional and uses settlement snapshot rates.
-- - Stripe secret storage moves out of organizations.
-- - Notification creation is admin/manager-only.

ALTER TABLE public.quarterly_settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations DROP COLUMN IF EXISTS stripe_secret_key;

DROP POLICY IF EXISTS "Portal user can view own quarterly settlements" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Portal user can view own settlements" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Internal users can view all quarterly settlements" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Admins and managers can manage quarterly settlements" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Restrict portal quarterly settlement detail to final statuses" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Restrict quarterly settlement inserts to admin manager" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Restrict quarterly settlement updates to admin manager" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Restrict quarterly settlement deletes to admin manager" ON public.quarterly_settlements;

CREATE POLICY "Internal users can view all quarterly settlements"
ON public.quarterly_settlements
FOR SELECT
TO authenticated
USING (public.is_internal(auth.uid()));

CREATE POLICY "Portal user can view own final quarterly settlements"
ON public.quarterly_settlements
FOR SELECT
TO authenticated
USING (
  client_id = public.get_client_id_for_user(auth.uid())
  AND status IN ('approved', 'paid', 'charged_back')
);

CREATE POLICY "Admins and managers can manage quarterly settlements"
ON public.quarterly_settlements
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

-- Defense in depth: even if an older broad permissive SELECT policy remains,
-- portal users still cannot see non-final or other-client settlement rows.
CREATE POLICY "Restrict portal quarterly settlement detail to final statuses"
ON public.quarterly_settlements
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.is_internal(auth.uid())
  OR (
    client_id = public.get_client_id_for_user(auth.uid())
    AND status IN ('approved', 'paid', 'charged_back')
  )
);

CREATE POLICY "Restrict quarterly settlement inserts to admin manager"
ON public.quarterly_settlements
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Restrict quarterly settlement updates to admin manager"
ON public.quarterly_settlements
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Restrict quarterly settlement deletes to admin manager"
ON public.quarterly_settlements
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

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
  v_client_id := public.get_client_id_for_user(auth.uid());

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
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
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

DROP POLICY IF EXISTS "Internal users can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins and managers can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Restrict notification inserts to admin manager" ON public.notifications;

CREATE POLICY "Admins and managers can create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);

CREATE POLICY "Restrict notification inserts to admin manager"
ON public.notifications
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
);
