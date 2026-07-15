-- Documentnummering conform het commissionairs-handboek (15-07-2026): twee
-- gescheiden, klantnummer-gebaseerde reeksen i.p.v. de doorlopende ECF-reeks.
--   vat_liable      → self-billing factuur  →  S-JJJJ-MM-<klantnr>
--   kor / private   → betaalspecificatie    →  B-JJJJ-MM-<klantnr>
-- Deterministisch en uniek (één afrekening per klant-maand; de bestaande unieke
-- partiële index op invoice_number borgt het). Geen sequences nodig. Echoot de
-- legacy EC-JJJJMM-klantnr. De 2 bestaande ECF-nummers blijven historisch geldig.
--
-- Enige wijziging t.o.v. 20260612140000: de nummer-toekenning in de UPDATE. De
-- volledige compliance-guard eromheen blijft identiek. vat_status en client_number
-- zijn op dat punt gegarandeerd non-null (de guard hierboven blokkeert anders).

CREATE OR REPLACE FUNCTION public.approve_settlements(settlement_ids uuid[])
RETURNS TABLE (approved_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_approved integer;
  v_org_problems text;
  v_problems text;
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
  FROM public.settlements s
  WHERE s.id = ANY(settlement_ids);

  IF v_found <> v_requested THEN
    RAISE EXCEPTION 'Een of meer afrekeningen bestaan niet';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.settlements s
    WHERE s.id = ANY(settlement_ids) AND s.status <> 'calculated'
  ) THEN
    RAISE EXCEPTION 'Alleen berekende afrekeningen kunnen worden goedgekeurd';
  END IF;

  -- Wet OB: goedkeuren = factuurnummer toekennen = factuur is uitreikbaar.
  -- Eerst de eigen (afnemer-)gegevens controleren…
  SELECT NULLIF(concat_ws(', ',
    CASE WHEN COALESCE(btrim(o.name), '') = '' THEN 'bedrijfsnaam' END,
    CASE WHEN COALESCE(btrim(o.address_street), '') = '' THEN 'straat' END,
    CASE WHEN COALESCE(btrim(o.address_postal), '') = '' THEN 'postcode' END,
    CASE WHEN COALESCE(btrim(o.address_city), '') = '' THEN 'plaats' END,
    CASE WHEN o.kvk IS NULL OR o.kvk !~ '^[0-9]{8}$' OR o.kvk = '12345678' THEN 'KVK-nummer (geen placeholder)' END,
    CASE WHEN COALESCE(btrim(o.btw_number), '') = '' THEN 'BTW-nummer' END,
    CASE WHEN COALESCE(btrim(o.iban), '') = '' THEN 'IBAN' END
  ), '') INTO v_org_problems
  FROM public.organizations o
  ORDER BY o.created_at LIMIT 1;

  IF v_org_problems IS NOT NULL THEN
    RAISE EXCEPTION 'Goedkeuren geblokkeerd — factuurgegevens van de eigen organisatie onvolledig (Instellingen → Bedrijf): %', v_org_problems;
  END IF;

  -- …daarna per klant (leverancier) de wettelijk verplichte gegevens.
  SELECT string_agg(line, ' | ') INTO v_problems
  FROM (
    SELECT format('%s (%s-%s): %s',
             COALESCE(c.company_name, 'Onbekende klant'), s.year, lpad(s.month::text, 2, '0'),
             concat_ws(', ',
               CASE WHEN c.vat_status IS NULL THEN 'BTW-status niet opgegeven' END,
               CASE WHEN c.vat_status IS NOT NULL AND c.vat_status_confirmed_at IS NULL
                    THEN 'BTW-status niet bevestigd door admin' END,
               CASE WHEN COALESCE(btrim(c.company_name), '') = '' THEN 'bedrijfsnaam' END,
               CASE WHEN COALESCE(btrim(c.billing_address_street), '') = '' THEN 'factuuradres (straat)' END,
               CASE WHEN COALESCE(btrim(c.billing_address_postal), '') = '' THEN 'postcode' END,
               CASE WHEN COALESCE(btrim(c.billing_address_city), '') = '' THEN 'plaats' END,
               CASE WHEN c.vat_status IN ('vat_liable','kor')
                     AND COALESCE(btrim(c.kvk), '') = '' THEN 'KvK-nummer' END,
               CASE WHEN c.vat_status = 'vat_liable'
                     AND COALESCE(btrim(c.btw_number), '') = '' THEN 'BTW-nummer' END,
               CASE WHEN c.client_number IS NULL THEN 'klantnummer' END,
               CASE WHEN COALESCE(btrim(d.payout_iban), '') = '' THEN 'IBAN (uitbetaling)' END,
               CASE WHEN COALESCE(btrim(d.payout_account_holder_name), '') = '' THEN 'rekeninghouder' END
             )) AS line
    FROM public.settlements s
    JOIN public.clients c ON c.id = s.client_id
    LEFT JOIN public.client_payment_details d ON d.client_id = c.id
    WHERE s.id = ANY(settlement_ids)
      AND (
        c.vat_status IS NULL
        OR c.vat_status_confirmed_at IS NULL
        OR COALESCE(btrim(c.company_name), '') = ''
        OR COALESCE(btrim(c.billing_address_street), '') = ''
        OR COALESCE(btrim(c.billing_address_postal), '') = ''
        OR COALESCE(btrim(c.billing_address_city), '') = ''
        OR (c.vat_status IN ('vat_liable','kor') AND COALESCE(btrim(c.kvk), '') = '')
        OR (c.vat_status = 'vat_liable' AND COALESCE(btrim(c.btw_number), '') = '')
        OR c.client_number IS NULL
        OR COALESCE(btrim(d.payout_iban), '') = ''
        OR COALESCE(btrim(d.payout_account_holder_name), '') = ''
      )
  ) problems;

  IF v_problems IS NOT NULL THEN
    RAISE EXCEPTION 'Goedkeuren geblokkeerd — factuurgegevens onvolledig: %', v_problems;
  END IF;

  -- Goedkeuren: klantnummer-gebaseerd documentnummer toekennen (een eerder
  -- gereserveerd nummer blijft behouden; COALESCE is lazy). Prefix volgt de
  -- BTW-status: vat_liable → S (self-billing factuur), kor/private → B
  -- (betaalspecificatie). + BTW-status-snapshot voor de documentvermelding.
  UPDATE public.settlements s
  SET status = 'approved',
      invoice_number = COALESCE(
        s.invoice_number,
        CASE WHEN c.vat_status = 'vat_liable' THEN 'S' ELSE 'B' END
          || '-' || s.year::text || '-' || lpad(s.month::text, 2, '0')
          || '-' || c.client_number::text
      ),
      vat_status = c.vat_status,
      updated_at = now()
  FROM public.clients c
  WHERE c.id = s.client_id
    AND s.id = ANY(settlement_ids)
    AND s.status = 'calculated';

  GET DIAGNOSTICS v_approved = ROW_COUNT;
  RETURN QUERY SELECT v_approved;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_settlements(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_settlements(uuid[]) TO authenticated;

COMMENT ON COLUMN public.settlements.invoice_number IS
  'Definitief documentnummer, toegekend bij goedkeuring. Reeksen: S-JJJJ-MM-<klantnr> (self-billing factuur, vat_liable) / B-JJJJ-MM-<klantnr> (betaalspecificatie, kor/private). Legacy EC-JJJJMM-klantnr en ECF-JJJJ-NNNNN blijven geldig. Blijft gereserveerd bij terugdraaien.';
