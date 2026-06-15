-- Service-fee kwijtschelden per maand (per klant).
--
-- 1. settlements.fee_waived — markeert dat de E-Charging service-fee voor die
--    maand is kwijtgescholden. Bij kwijtschelding wordt de fee-snapshot genuld
--    (echarging_fee_per_kwh = 0, echarging_revenue = 0, client_payout = bruto),
--    zodat factuur-PDF, CSV-export, KPI's en portal-payout automatisch kloppen.
-- 2. RPC set_settlement_fee_waived — togglet de kwijtschelding. Alleen
--    admin/manager; alleen voor maanden met status 'live' of 'calculated'
--    (vanaf 'approved' is de afrekening financieel vergrendeld).
-- 3. get_portal_sessions — rekent de netto sessie-vergoeding voortaan met de
--    MAAND-SNAPSHOT van de fee (settlements.echarging_fee_per_kwh) i.p.v. het
--    huidige klanttarief. Kwijtgescholden maanden krijgen zo automatisch fee 0,
--    en historische maanden volgen hun eigen tarief (lost ook een latente
--    inconsistentie bij tariefwijzigingen op). Maandtoewijzing volgt
--    Europe/Amsterdam, identiek aan de aggregatie (amsterdam_month_bounds).

-- 1. Kolom
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS fee_waived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.settlements.fee_waived IS
  'Service-fee voor deze maand kwijtgescholden (snapshot genuld; zie set_settlement_fee_waived)';

-- 2. Toggle-RPC
CREATE OR REPLACE FUNCTION public.set_settlement_fee_waived(p_settlement_id uuid, p_waived boolean)
RETURNS TABLE (
  id uuid,
  fee_waived boolean,
  echarging_fee_per_kwh numeric,
  echarging_revenue numeric,
  client_payout numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_client_id uuid;
  v_rate numeric;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag de service-fee kwijtschelden' USING ERRCODE = '42501';
  END IF;

  SELECT s.status, s.client_id
    INTO v_status, v_client_id
  FROM public.settlements s
  WHERE s.id = p_settlement_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Afrekening bestaat niet';
  END IF;

  IF v_status NOT IN ('live', 'calculated') THEN
    RAISE EXCEPTION 'Alleen lopende of berekende maanden kunnen worden kwijtgescholden (status: %)', v_status;
  END IF;

  IF p_waived THEN
    UPDATE public.settlements s
    SET fee_waived = true,
        echarging_fee_per_kwh = 0,
        echarging_revenue = 0,
        client_payout = s.gross_revenue,
        updated_at = now()
    WHERE s.id = p_settlement_id;
  ELSE
    -- Herstel: tarief opnieuw afleiden (per-klant override → org-default → 0.10),
    -- identiek aan de aggregate-settlements edge function.
    SELECT COALESCE(
             c.echarging_fee_per_kwh,
             (SELECT o.default_echarging_fee_per_kwh FROM public.organizations o ORDER BY o.created_at LIMIT 1),
             0.10
           )
      INTO v_rate
    FROM public.clients c
    WHERE c.id = v_client_id;

    v_rate := COALESCE(v_rate, 0.10);

    UPDATE public.settlements s
    SET fee_waived = false,
        echarging_fee_per_kwh = v_rate,
        echarging_revenue = v_rate * s.total_kwh,
        client_payout = s.gross_revenue - (v_rate * s.total_kwh),
        updated_at = now()
    WHERE s.id = p_settlement_id;
  END IF;

  RETURN QUERY
  SELECT s.id, s.fee_waived, s.echarging_fee_per_kwh, s.echarging_revenue, s.client_payout
  FROM public.settlements s
  WHERE s.id = p_settlement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_settlement_fee_waived(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_settlement_fee_waived(uuid, boolean) TO authenticated;

-- 3. get_portal_sessions: maand-snapshot van de fee i.p.v. huidig klanttarief
CREATE OR REPLACE FUNCTION public.get_portal_sessions(
  p_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_location_id uuid DEFAULT NULL::uuid,
  p_charge_point_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  id uuid,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_minutes integer,
  kwh_delivered numeric,
  charge_point_id uuid,
  charge_point_name text,
  location_name text,
  vergoeding numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_client_id uuid;
  v_fee numeric;
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RETURN;
  END IF;

  -- Fallback-tarief voor maanden zonder settlement-rij (bv. de allereerste sessies)
  SELECT COALESCE(
           c.echarging_fee_per_kwh,
           (SELECT o.default_echarging_fee_per_kwh FROM public.organizations o ORDER BY o.created_at LIMIT 1),
           0.10
         )
    INTO v_fee
  FROM public.clients c
  WHERE c.id = v_client_id;

  v_fee := COALESCE(v_fee, 0.10);

  RETURN QUERY
  SELECT
    cs.id,
    cs.started_at,
    cs.ended_at,
    cs.duration_minutes::integer,
    cs.kwh_delivered::numeric,
    cs.charge_point_id,
    cp.name AS charge_point_name,
    l.name  AS location_name,
    -- Maand-snapshot van de fee (0 bij kwijtschelding); maandtoewijzing in
    -- Europe/Amsterdam, identiek aan de aggregatie.
    (COALESCE(cs.reimbursement_amount, 0)
      - COALESCE(st.echarging_fee_per_kwh, v_fee) * COALESCE(cs.kwh_delivered, 0))::numeric AS vergoeding
  FROM public.charging_sessions cs
  LEFT JOIN public.charge_points cp ON cp.id = cs.charge_point_id
  LEFT JOIN public.locations    l  ON l.id  = cs.location_id
  LEFT JOIN public.settlements  st ON st.client_id = cs.client_id
    AND st.year  = EXTRACT(YEAR  FROM (cs.started_at AT TIME ZONE 'Europe/Amsterdam'))::integer
    AND st.month = EXTRACT(MONTH FROM (cs.started_at AT TIME ZONE 'Europe/Amsterdam'))::integer
  WHERE cs.client_id = v_client_id
    AND cs.excluded = false
    AND (p_from IS NULL OR cs.started_at >= p_from)
    AND (p_to   IS NULL OR cs.started_at <  p_to)
    AND (p_location_id     IS NULL OR cs.location_id     = p_location_id)
    AND (p_charge_point_id IS NULL OR cs.charge_point_id = p_charge_point_id)
  ORDER BY cs.started_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 1000), 1);
END;
$$;
