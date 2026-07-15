-- Omzet-erkenning conform de businessregel: een afrekening telt als omzet zolang hij
-- aan een ECHT (niet-verwijderd) klantaccount hangt — lopend (live/calculated) én
-- goedgekeurd tellen beide mee. Alleen afrekeningen op een verwijderd/geanonimiseerd
-- profiel ("ongekoppeld") tellen niet mee. Eigenaarloze sessies leveren sowieso geen
-- afrekening op.
--
-- Enige wijziging t.o.v. de vorige admin_settlement_kpis: een JOIN op clients +
-- filter coalesce(status,'actief') <> 'verwijderd' in de drie omzet-aggregaties.
-- GEEN status-filter op de settlement (lopend blijft meetellen).

CREATE OR REPLACE FUNCTION public.admin_settlement_kpis(p_year integer, p_cur_year integer, p_cur_month integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
DECLARE
  v_prev_year integer;
  v_prev_month integer;
  v_available integer[];
  v_monthly jsonb;
  v_cur jsonb;
  v_prev jsonb;
BEGIN
  IF NOT (SELECT app_private.is_internal(auth.uid())) THEN
    RAISE EXCEPTION 'Alleen interne gebruikers mogen de dashboard-KPI''s opvragen'
      USING ERRCODE = '42501';
  END IF;

  IF p_cur_month = 1 THEN
    v_prev_year := p_cur_year - 1; v_prev_month := 12;
  ELSE
    v_prev_year := p_cur_year; v_prev_month := p_cur_month - 1;
  END IF;

  SELECT COALESCE(array_agg(y ORDER BY y), ARRAY[]::integer[])
  INTO v_available
  FROM (
    SELECT DISTINCT year AS y FROM public.settlements WHERE year IS NOT NULL AND year <> 0
    UNION
    SELECT p_cur_year
  ) u;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'month', g.month,
             'revenue', COALESCE(s.revenue, 0),
             'kwh', COALESCE(s.kwh, 0),
             'clients', COALESCE(s.clients, 0)
           ) ORDER BY g.month
         ), '[]'::jsonb)
  INTO v_monthly
  FROM generate_series(1, 12) AS g(month)
  LEFT JOIN (
    SELECT st.month,
           sum(COALESCE(st.echarging_revenue, 0)) AS revenue,
           sum(COALESCE(st.total_kwh, 0))         AS kwh,
           count(*)                               AS clients
    FROM public.settlements st
    JOIN public.clients c ON c.id = st.client_id
    WHERE st.year = p_year AND COALESCE(c.status, 'actief') <> 'verwijderd'
    GROUP BY st.month
  ) s ON s.month = g.month;

  SELECT jsonb_build_object(
           'month_revenue', COALESCE(sum(COALESCE(st.echarging_revenue, 0)), 0),
           'total_kwh',     COALESCE(sum(COALESCE(st.total_kwh, 0)), 0),
           'total_revenue', COALESCE(sum(COALESCE(st.gross_revenue, 0)), 0)
         )
  INTO v_cur
  FROM public.settlements st
  JOIN public.clients c ON c.id = st.client_id
  WHERE st.year = p_cur_year AND st.month = p_cur_month
    AND COALESCE(c.status, 'actief') <> 'verwijderd';

  SELECT jsonb_build_object(
           'month_revenue', COALESCE(sum(COALESCE(st.echarging_revenue, 0)), 0),
           'kwh',           COALESCE(sum(COALESCE(st.total_kwh, 0)), 0)
         )
  INTO v_prev
  FROM public.settlements st
  JOIN public.clients c ON c.id = st.client_id
  WHERE st.year = v_prev_year AND st.month = v_prev_month
    AND COALESCE(c.status, 'actief') <> 'verwijderd';

  RETURN jsonb_build_object(
    'available_years', to_jsonb(v_available),
    'monthly', v_monthly,
    'cur', v_cur,
    'prev', v_prev
  );
END;
$function$;
