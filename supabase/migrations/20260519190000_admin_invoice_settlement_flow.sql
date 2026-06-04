-- Align settlement money-flow with manual bank payments and invoice handling.
-- Positive approved settlements are paid by bank transfer.
-- Negative approved settlements are followed up by invoice status.

ALTER TABLE public.quarterly_settlements
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz;

ALTER TABLE public.quarterly_settlements
  DROP CONSTRAINT IF EXISTS quarterly_settlements_status_check;

ALTER TABLE public.quarterly_settlements
  ADD CONSTRAINT quarterly_settlements_status_check
  CHECK (
    status IN (
      'live',
      'calculated',
      'approved',
      'paid',
      'invoice_sent',
      'invoice_paid',
      'charged_back',
      'overdue'
    )
  );

DROP POLICY IF EXISTS "Portal user can view own final quarterly settlements" ON public.quarterly_settlements;
DROP POLICY IF EXISTS "Restrict portal quarterly settlement detail to final statuses" ON public.quarterly_settlements;

CREATE POLICY "Portal user can view own final quarterly settlements" ON public.quarterly_settlements
  FOR SELECT TO authenticated
  USING (
    client_id = app_private.get_client_id_for_user(auth.uid())
    AND status IN ('approved', 'paid', 'invoice_sent', 'invoice_paid', 'charged_back')
  );

CREATE POLICY "Restrict portal quarterly settlement detail to final statuses" ON public.quarterly_settlements
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    app_private.is_internal(auth.uid())
    OR (
      client_id = app_private.get_client_id_for_user(auth.uid())
      AND status IN ('approved', 'paid', 'invoice_sent', 'invoice_paid', 'charged_back')
    )
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
    (qs.status IN ('approved', 'paid', 'invoice_sent', 'invoice_paid', 'charged_back')) AS is_final,
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
    SELECT
      qs.id,
      qs.status,
      COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0) AS customer_cashflow
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

  IF EXISTS (
    SELECT 1
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
      AND (COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0)) < 0
  ) THEN
    RAISE EXCEPTION 'Negatieve afrekeningen moeten via de factuurflow worden verwerkt';
  END IF;

  UPDATE public.quarterly_settlements qs
  SET status = 'paid',
      paid_at = now(),
      updated_at = now()
  WHERE qs.id = ANY(settlement_ids)
    AND qs.status = 'approved'
    AND (COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0)) >= 0;

  GET DIAGNOSTICS v_paid = ROW_COUNT;

  RETURN QUERY SELECT v_paid;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_settlements_paid(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_settlements_paid(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_settlements_invoice_sent(settlement_ids uuid[])
RETURNS TABLE (sent_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_sent integer;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag factuurstatussen verwerken' USING ERRCODE = '42501';
  END IF;

  v_requested := COALESCE(cardinality(settlement_ids), 0);
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'Geen afrekeningen geselecteerd';
  END IF;

  WITH selected AS (
    SELECT
      qs.id,
      qs.status,
      COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0) AS customer_cashflow
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
    RAISE EXCEPTION 'Alleen goedgekeurde afrekeningen kunnen als factuur verzonden worden gemarkeerd';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quarterly_settlements qs
    WHERE qs.id = ANY(settlement_ids)
      AND (COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0)) >= 0
  ) THEN
    RAISE EXCEPTION 'Alleen negatieve afrekeningen kunnen via de factuurflow worden verwerkt';
  END IF;

  UPDATE public.quarterly_settlements qs
  SET status = 'invoice_sent',
      invoice_sent_at = COALESCE(qs.invoice_sent_at, now()),
      updated_at = now()
  WHERE qs.id = ANY(settlement_ids)
    AND qs.status = 'approved'
    AND (COALESCE(qs.client_payout, 0) + COALESCE(qs.total_energy_cost, 0)) < 0;

  GET DIAGNOSTICS v_sent = ROW_COUNT;

  RETURN QUERY SELECT v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_settlements_invoice_sent(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_settlements_invoice_sent(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_settlements_invoice_paid(settlement_ids uuid[])
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
    RAISE EXCEPTION 'Alleen admin/manager mag factuurstatussen verwerken' USING ERRCODE = '42501';
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
      AND qs.status <> 'invoice_sent'
  ) THEN
    RAISE EXCEPTION 'Alleen open facturen kunnen als voldaan worden gemarkeerd';
  END IF;

  UPDATE public.quarterly_settlements qs
  SET status = 'invoice_paid',
      paid_at = now(),
      updated_at = now()
  WHERE qs.id = ANY(settlement_ids)
    AND qs.status = 'invoice_sent';

  GET DIAGNOSTICS v_paid = ROW_COUNT;

  RETURN QUERY SELECT v_paid;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_settlements_invoice_paid(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_settlements_invoice_paid(uuid[]) TO authenticated;
