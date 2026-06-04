-- Pilotfase: sessies volgen locatiecorrecties totdat een kwartaal definitief is afgerekend.

DROP FUNCTION IF EXISTS public.set_location_client(uuid, uuid);

CREATE OR REPLACE FUNCTION public.set_location_client(location_id uuid, client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location public.locations%ROWTYPE;
  v_previous_client_id uuid;
  v_action text;
  v_reassigned_sessions integer := 0;
  v_retained_final_sessions integer := 0;
  v_deleted_open_settlements integer := 0;
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

  IF $2 IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = $2
      AND COALESCE(c.status, 'actief') <> 'verwijderd'
  ) THEN
    RAISE EXCEPTION 'Klant niet gevonden';
  END IF;

  v_previous_client_id := v_location.client_id;

  DROP TABLE IF EXISTS pg_temp.session_reassignment_scope;
  CREATE TEMP TABLE pg_temp.session_reassignment_scope ON COMMIT DROP AS
  SELECT
    cs.id,
    cs.client_id AS old_client_id,
    EXTRACT(YEAR FROM cs.started_at AT TIME ZONE 'UTC')::integer AS session_year,
    EXTRACT(QUARTER FROM cs.started_at AT TIME ZONE 'UTC')::integer AS session_quarter,
    EXISTS (
      SELECT 1
      FROM public.quarterly_settlements qs
      WHERE qs.client_id = cs.client_id
        AND qs.year = EXTRACT(YEAR FROM cs.started_at AT TIME ZONE 'UTC')::integer
        AND qs.quarter = EXTRACT(QUARTER FROM cs.started_at AT TIME ZONE 'UTC')::integer
        AND qs.status = ANY (ARRAY['approved', 'paid', 'invoice_sent', 'invoice_paid', 'charged_back'])
    ) AS is_final
  FROM public.charging_sessions cs
  WHERE cs.location_id = $1;

  SELECT COUNT(*)
  INTO v_retained_final_sessions
  FROM pg_temp.session_reassignment_scope
  WHERE is_final;

  WITH affected_pairs AS (
    SELECT old_client_id AS affected_client_id, session_year, session_quarter
    FROM pg_temp.session_reassignment_scope
    WHERE NOT is_final
      AND old_client_id IS NOT NULL
    UNION
    SELECT $2 AS affected_client_id, session_year, session_quarter
    FROM pg_temp.session_reassignment_scope
    WHERE NOT is_final
      AND $2 IS NOT NULL
  )
  DELETE FROM public.quarterly_settlements qs
  USING affected_pairs ap
  WHERE qs.client_id = ap.affected_client_id
    AND qs.year = ap.session_year
    AND qs.quarter = ap.session_quarter
    AND qs.status = ANY (ARRAY['live', 'calculated']);

  GET DIAGNOSTICS v_deleted_open_settlements = ROW_COUNT;

  UPDATE public.charging_sessions cs
  SET
    client_id = $2,
    updated_at = now()
  FROM pg_temp.session_reassignment_scope scope
  WHERE cs.id = scope.id
    AND NOT scope.is_final
    AND cs.client_id IS DISTINCT FROM $2;

  GET DIAGNOSTICS v_reassigned_sessions = ROW_COUNT;

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

  v_action := CASE WHEN $2 IS NULL THEN 'location_unlinked' ELSE 'location_linked' END;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    COALESCE($2, v_previous_client_id),
    auth.uid(),
    v_action,
    CASE WHEN $2 IS NULL THEN 'Locatie ontkoppeld' ELSE 'Locatie gekoppeld aan klant' END,
    jsonb_build_object(
      'location_id', $1,
      'previous_client_id', v_previous_client_id,
      'client_id', $2,
      'reassigned_sessions', v_reassigned_sessions,
      'retained_final_sessions', v_retained_final_sessions,
      'deleted_open_settlements', v_deleted_open_settlements
    )
  );

  RETURN jsonb_build_object(
    'location', to_jsonb(v_location),
    'previous_client_id', v_previous_client_id,
    'client_id', $2,
    'reassigned_sessions', v_reassigned_sessions,
    'retained_final_sessions', v_retained_final_sessions,
    'deleted_open_settlements', v_deleted_open_settlements
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_location_client(uuid, uuid) TO authenticated;
