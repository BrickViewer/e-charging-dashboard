-- Goedkeuring van afrekeningen terugdraaien (approved → calculated).
--
-- Use-case: een maand is goedgekeurd maar moet toch nog aangepast worden
-- (bv. service-fee alsnog kwijtschelden). Terugdraaien kan alleen zolang er
-- nog geen geldstroom is gestart: status moet exact 'approved' zijn
-- (paid / invoice_sent / invoice_paid / charged_back zijn definitief).
-- eflux_reimbursed_at blijft staan (feit dat e-Flux ons betaald heeft);
-- de dagelijkse aggregatie herrekent calculated-rijen daarna gewoon weer mee.

CREATE OR REPLACE FUNCTION public.unapprove_settlements(settlement_ids uuid[])
RETURNS TABLE (unapproved_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_unapproved integer;
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag goedkeuringen terugdraaien' USING ERRCODE = '42501';
  END IF;

  v_requested := COALESCE(cardinality(settlement_ids), 0);
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'Geen afrekeningen geselecteerd';
  END IF;

  SELECT COUNT(*) INTO v_found
  FROM public.settlements s
  WHERE s.id = ANY(settlement_ids);

  IF v_found <> v_requested THEN
    RAISE EXCEPTION 'Een of meer afrekeningen bestaan niet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = ANY(settlement_ids)
      AND s.status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'Alleen goedgekeurde afrekeningen kunnen worden teruggedraaid (betaald/gefactureerd is definitief)';
  END IF;

  UPDATE public.settlements s
  SET status = 'calculated',
      updated_at = now()
  WHERE s.id = ANY(settlement_ids)
    AND s.status = 'approved';

  GET DIAGNOSTICS v_unapproved = ROW_COUNT;

  RETURN QUERY SELECT v_unapproved;
END;
$$;

REVOKE ALL ON FUNCTION public.unapprove_settlements(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unapprove_settlements(uuid[]) TO authenticated;
