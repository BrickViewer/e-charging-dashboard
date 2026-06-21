-- Fase 4b-A — server-side dashboard-KPI's (settlement-aggregatie).
--
-- Spiegelt de JS-derivatie in useAdminKPIs EXACT, maar verplaatst de aggregatie van
-- de client (die voorheen ÁLLE settlements ophaalde) naar de server:
--   • available_years = distinct settlement-jaren (year<>0) ∪ p_cur_year, oplopend
--       (= JS: new Set(years.filter(Boolean)).add(cur.year))
--   • monthly        = 12 rijen (jan→dec) voor p_year met sum(echarging_revenue),
--                      sum(total_kwh), count(*) (= JS reduce + periodSettlements.length)
--   • cur            = sommen voor de lopende maand (p_cur_year/p_cur_month)
--   • prev           = sommen voor de vorige maand (shiftMonth(-1))
-- coalesce(col,0) ↔ Number(col || 0). De client houdt de labels (monthShortLabel) en
-- de % -afgeleiden (revenueChange/kwhChange) zelf; alleen de sommen verhuizen.
--
-- Toegang = exact de bestaande SELECT-policy "Internal users can view all settlements"
-- (app_private.is_internal). SECURITY DEFINER + expliciete GRANT, geen verbreding.

CREATE OR REPLACE FUNCTION public.admin_settlement_kpis(
  p_year integer,
  p_cur_year integer,
  p_cur_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $$
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

  -- Vorige maand (jaargrens-veilig, = shiftMonth(cur, -1)).
  IF p_cur_month = 1 THEN
    v_prev_year := p_cur_year - 1; v_prev_month := 12;
  ELSE
    v_prev_year := p_cur_year; v_prev_month := p_cur_month - 1;
  END IF;

  -- available_years: distinct year (truthy) ∪ p_cur_year, oplopend.
  SELECT COALESCE(array_agg(y ORDER BY y), ARRAY[]::integer[])
  INTO v_available
  FROM (
    SELECT DISTINCT year AS y FROM public.settlements WHERE year IS NOT NULL AND year <> 0
    UNION
    SELECT p_cur_year
  ) u;

  -- monthly: altijd 12 rijen (lege maanden → 0), voor p_year.
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
    SELECT month,
           sum(COALESCE(echarging_revenue, 0)) AS revenue,
           sum(COALESCE(total_kwh, 0))         AS kwh,
           count(*)                            AS clients
    FROM public.settlements
    WHERE year = p_year
    GROUP BY month
  ) s ON s.month = g.month;

  -- cur: lopende maand (echarging_revenue / total_kwh / gross_revenue).
  SELECT jsonb_build_object(
           'month_revenue', COALESCE(sum(COALESCE(echarging_revenue, 0)), 0),
           'total_kwh',     COALESCE(sum(COALESCE(total_kwh, 0)), 0),
           'total_revenue', COALESCE(sum(COALESCE(gross_revenue, 0)), 0)
         )
  INTO v_cur
  FROM public.settlements
  WHERE year = p_cur_year AND month = p_cur_month;

  -- prev: vorige maand (alleen echarging_revenue + total_kwh nodig).
  SELECT jsonb_build_object(
           'month_revenue', COALESCE(sum(COALESCE(echarging_revenue, 0)), 0),
           'kwh',           COALESCE(sum(COALESCE(total_kwh, 0)), 0)
         )
  INTO v_prev
  FROM public.settlements
  WHERE year = v_prev_year AND month = v_prev_month;

  RETURN jsonb_build_object(
    'available_years', to_jsonb(v_available),
    'monthly', v_monthly,
    'cur', v_cur,
    'prev', v_prev
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_settlement_kpis(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_settlement_kpis(integer, integer, integer) TO authenticated;
