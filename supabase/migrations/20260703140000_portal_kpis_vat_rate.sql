-- Add vat_rate output column to public.get_portal_dashboard_kpis()
-- so the portal can compute net-of-activation payout correctly for
-- particulier/KOR clients. Adding a column changes the RETURNS TABLE
-- return type, so CREATE OR REPLACE would fail -> DROP + recreate.

DROP FUNCTION IF EXISTS public.get_portal_dashboard_kpis();

CREATE OR REPLACE FUNCTION public.get_portal_dashboard_kpis()
 RETURNS TABLE(year integer, month integer, period_start date, period_end date, status text, is_final boolean, total_kwh numeric, total_customer_cashflow numeric, estimated_client_yield numeric, co2_kg_avoided numeric, ere_estimate numeric, activation_cost numeric, vat_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
DECLARE
  v_client_id uuid;
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.year,
    s.month,
    s.period_start::date,
    s.period_end::date,
    s.status::text,
    (s.status IN ('approved','paid','invoice_sent','invoice_paid','charged_back')) AS is_final,
    COALESCE(s.total_kwh, 0)::numeric AS total_kwh,
    COALESCE(s.client_payout, 0)::numeric AS total_customer_cashflow,
    COALESCE(s.client_payout, 0)::numeric AS estimated_client_yield,
    (COALESCE(s.total_kwh, 0)::numeric * 0.306)::numeric AS co2_kg_avoided,
    COALESCE(s.ere_estimate, 0)::numeric AS ere_estimate,
    COALESCE(s.activation_cost, 0)::numeric AS activation_cost,
    COALESCE(s.vat_rate, 0.21)::numeric AS vat_rate
  FROM public.settlements s
  WHERE s.client_id = v_client_id
  ORDER BY s.year DESC, s.month DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_portal_dashboard_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard_kpis() TO service_role;
