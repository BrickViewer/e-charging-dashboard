-- Self-billing facturen NL-wet-compliant (Wet OB art. 35a):
--
-- 1. Doorlopende factuurnummer-reeks ECF-YYYY-NNNNN, toegekend bij goedkeuring.
--    Reeds uitgereikte afrekeningen behouden hun gecommuniceerde legacy-nummer
--    (EC-JJJJMM-klantnr) — dat blijft canoniek en wordt hier vastgelegd.
-- 2. BTW-status per klant: vat_liable (21%, BTW-nr verplicht) / kor (vrijgesteld
--    o.g.v. KOR) / private (particulier). Host geeft op in het portaal; admin
--    bevestigt; zonder bevestiging geen goedkeuring.
-- 3. Volledige NAW-vereisten (gesplitst adres + land) voor klant én organisatie.
-- 4. approve_settlements blokkeert goedkeuring bij onvolledige factuurgegevens:
--    nummer-toekenning impliceert een uitreikbare, compliant factuur.

-- ───────────────────────── settlements ─────────────────────────
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS vat_status text;

ALTER TABLE public.settlements
  DROP CONSTRAINT IF EXISTS settlements_vat_status_check;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_vat_status_check
  CHECK (vat_status IS NULL OR vat_status IN ('vat_liable','kor','private'));

CREATE UNIQUE INDEX IF NOT EXISTS settlements_invoice_number_key
  ON public.settlements (invoice_number)
  WHERE invoice_number IS NOT NULL;

COMMENT ON COLUMN public.settlements.invoice_number IS
  'Definitief factuurnummer, toegekend bij goedkeuring (legacy EC-JJJJMM-klantnr of ECF-YYYY-NNNNN). Blijft gereserveerd bij terugdraaien.';
COMMENT ON COLUMN public.settlements.vat_status IS
  'Snapshot van clients.vat_status op het moment van goedkeuren (bepaalt de BTW-vermelding op de factuur).';

-- Backfill: reeds uitgereikte afrekeningen krijgen hun legacy afgeleide nummer
-- vastgelegd zoals het is gecommuniceerd. Dedupe (theoretisch hergebruikte
-- klantnummers) via row_number; alleen rn=1 krijgt het legacy-nummer.
WITH cand AS (
  SELECT s.id,
         'EC-' || s.year::text || lpad(s.month::text, 2, '0') || '-' || c.client_number::text AS nr,
         row_number() OVER (
           PARTITION BY 'EC-' || s.year::text || lpad(s.month::text, 2, '0') || '-' || c.client_number::text
           ORDER BY s.created_at
         ) AS rn
  FROM public.settlements s
  JOIN public.clients c ON c.id = s.client_id
  WHERE s.invoice_number IS NULL
    AND s.status IN ('approved','paid','invoice_sent','invoice_paid','charged_back')
    AND c.client_number IS NOT NULL
)
UPDATE public.settlements s
SET invoice_number = cand.nr, updated_at = now()
FROM cand
WHERE s.id = cand.id AND cand.rn = 1;

-- ───────────── nieuwe doorlopende reeks (patroon: quotes_offer_seq) ─────────────
CREATE SEQUENCE IF NOT EXISTS public.settlements_invoice_seq;

CREATE OR REPLACE FUNCTION public.next_settlement_invoice_number()
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'ECF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.settlements_invoice_seq')::text, 5, '0');
$$;

REVOKE ALL ON FUNCTION public.next_settlement_invoice_number() FROM PUBLIC;
-- Bewust geen grant aan authenticated: alleen aanroepbaar via de approve-RPC.

-- Restgevallen (klantnummer NULL of dedupe-verliezer): nieuw ECF-nummer zodat
-- álle uitgereikte rijen een nummer hebben (verwacht: 0 rijen).
UPDATE public.settlements s
SET invoice_number = public.next_settlement_invoice_number(), updated_at = now()
WHERE s.invoice_number IS NULL
  AND s.status IN ('approved','paid','invoice_sent','invoice_paid','charged_back');

-- ───────────────────────── clients ─────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS vat_status text,
  ADD COLUMN IF NOT EXISTS vat_status_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vat_status_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Nederland';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_vat_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_vat_status_check
  CHECK (vat_status IS NULL OR vat_status IN ('vat_liable','kor','private'));

COMMENT ON COLUMN public.clients.vat_status IS
  'BTW-status leverancier: vat_liable (21%, BTW-nr verplicht) / kor / private. NULL = nog niet opgegeven. vat_liable(boolean) blijft als legacy-fallback voor de aggregatie en wordt bij bevestigen gesynct.';

-- ───────────────────────── organizations ─────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_postal text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Nederland';

-- Best-effort migratie van het enkelvoudige adres ("Stationsplein 1, Eindhoven"):
-- vóór de laatste komma → straat, erna → plaats. Postcode blijft leeg en
-- verschijnt op de admin-checklist tot hij is ingevuld.
UPDATE public.organizations
SET address_street = COALESCE(address_street, NULLIF(btrim(split_part(address, ',', 1)), '')),
    address_city   = COALESCE(address_city,
      CASE WHEN position(',' in COALESCE(address, '')) > 0
           THEN NULLIF(btrim(split_part(address, ',', 2)), '') END)
WHERE address IS NOT NULL;

-- ──────────── approve_settlements: compliance-guard + nummer + snapshot ────────────
DROP FUNCTION IF EXISTS public.approve_settlements(uuid[]);

CREATE FUNCTION public.approve_settlements(settlement_ids uuid[])
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

  -- Goedkeuren: nummer toekennen (een eerder gereserveerd nummer wordt
  -- hergebruikt; COALESCE is lazy, dus nextval vuurt alleen bij NULL) +
  -- BTW-status-snapshot voor de factuurvermelding.
  UPDATE public.settlements s
  SET status = 'approved',
      invoice_number = COALESCE(s.invoice_number, public.next_settlement_invoice_number()),
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

-- ─────────── confirm_client_vat_status (admin bevestigt, evt. met correctie) ───────────
CREATE OR REPLACE FUNCTION public.confirm_client_vat_status(p_client_id uuid, p_vat_status text)
RETURNS TABLE (id uuid, vat_status text, vat_status_confirmed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Alleen admin/manager mag de BTW-status bevestigen' USING ERRCODE = '42501';
  END IF;

  IF p_vat_status NOT IN ('vat_liable','kor','private') THEN
    RAISE EXCEPTION 'Ongeldige BTW-status: %', p_vat_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.clients c
  SET vat_status = p_vat_status,
      vat_status_confirmed_at = now(),
      vat_status_confirmed_by = auth.uid(),
      vat_liable = (p_vat_status = 'vat_liable'), -- legacy-kolom synchroon houden
      updated_at = now()
  WHERE c.id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Klant bestaat niet';
  END IF;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (p_client_id, auth.uid(), 'client_vat_status_confirmed',
          'BTW-status bevestigd door admin',
          jsonb_build_object('vat_status', p_vat_status));

  RETURN QUERY
  SELECT c.id, c.vat_status, c.vat_status_confirmed_at
  FROM public.clients c WHERE c.id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_client_vat_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_client_vat_status(uuid, text) TO authenticated;

-- ─────────── update_portal_company_details: BTW-status-bewust ───────────
-- Basis = live definitie; wijzigingen: p_vat_status-param, status-afhankelijke
-- KvK/BTW-validatie, bevestigings-reset bij gewijzigde keuze, metadata-uitbreiding.
-- Oude 13-args overload droppen zodat PostgREST eenduidig resolved.
DROP FUNCTION IF EXISTS public.update_portal_company_details(
  text, text, text, text, text, text, text, text, text, text, text, text, boolean
);

CREATE FUNCTION public.update_portal_company_details(
  p_company_name text,
  p_kvk text,
  p_btw_number text,
  p_contact_first_name text,
  p_contact_last_name text,
  p_contact_email text,
  p_contact_country_code text,
  p_contact_phone text,
  p_billing_address_street text,
  p_billing_address_postal text,
  p_billing_address_city text,
  p_invoice_email text,
  p_calculate_ere_enabled boolean DEFAULT false,
  p_vat_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_client_id uuid;
  v_btw text;
  v_contact_first_name text;
  v_contact_last_name text;
  v_contact_email text;
  v_contact_country_code text;
  v_contact_phone_digits text;
  v_kvk text;
  v_billing_postal text;
  v_invoice_email text;
  v_existing_iban text;
  v_vat_status text;
  v_effective_vat_status text;
  v_now timestamptz := now();
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Geen klantportaal gekoppeld aan deze gebruiker'
      USING ERRCODE = '42501';
  END IF;

  v_vat_status := nullif(trim(coalesce(p_vat_status, '')), '');
  IF v_vat_status IS NOT NULL AND v_vat_status NOT IN ('vat_liable','kor','private') THEN
    RAISE EXCEPTION 'Ongeldige BTW-status' USING ERRCODE = '22023';
  END IF;

  -- Effectieve status bepaalt welke velden verplicht zijn. NULL (oude frontend
  -- zonder keuze, klant zonder status) → strengste pad zoals voorheen.
  SELECT COALESCE(v_vat_status, c.vat_status) INTO v_effective_vat_status
  FROM public.clients c WHERE c.id = v_client_id;

  v_btw := nullif(upper(regexp_replace(coalesce(p_btw_number, ''), '[\s\.-]+', '', 'g')), '');
  v_kvk := nullif(regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g'), '');
  v_billing_postal := upper(regexp_replace(trim(coalesce(p_billing_address_postal, '')), '\s+', '', 'g'));
  v_invoice_email := lower(trim(coalesce(p_invoice_email, '')));
  v_contact_first_name := trim(coalesce(p_contact_first_name, ''));
  v_contact_last_name := trim(coalesce(p_contact_last_name, ''));
  v_contact_email := lower(trim(coalesce(p_contact_email, '')));
  v_contact_country_code := trim(coalesce(p_contact_country_code, '+31'));
  v_contact_phone_digits := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');

  IF v_contact_country_code IN ('31', 'NL+31', 'NL +31') THEN
    v_contact_country_code := '+31';
  END IF;

  IF left(v_contact_phone_digits, 4) = '0031' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 5);
  ELSIF left(v_contact_phone_digits, 2) = '31' AND length(v_contact_phone_digits) > 9 THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 3);
  END IF;

  IF left(v_contact_phone_digits, 1) = '0' THEN
    v_contact_phone_digits := substring(v_contact_phone_digits from 2);
  END IF;

  IF length(trim(coalesce(p_company_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Bedrijfsnaam is verplicht' USING ERRCODE = '22023';
  END IF;

  -- KvK: verplicht voor BTW-ondernemer en KOR (en bij onbekende status,
  -- zoals voorheen); particulier mag zonder — formaat-check alleen indien gevuld.
  IF v_effective_vat_status IS NULL OR v_effective_vat_status IN ('vat_liable','kor') THEN
    IF v_kvk IS NULL OR v_kvk !~ '^[0-9]{8}$' THEN
      RAISE EXCEPTION 'KvK-nummer moet uit 8 cijfers bestaan' USING ERRCODE = '22023';
    END IF;
  ELSIF v_kvk IS NOT NULL AND v_kvk !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'KvK-nummer moet uit 8 cijfers bestaan' USING ERRCODE = '22023';
  END IF;

  -- BTW-nummer: alleen verplicht voor BTW-ondernemer (en bij onbekende status,
  -- zoals voorheen); anders formaat-check alleen indien gevuld.
  IF v_effective_vat_status IS NULL OR v_effective_vat_status = 'vat_liable' THEN
    IF v_btw IS NULL OR v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' THEN
      RAISE EXCEPTION 'BTW-nummer heeft geen geldig formaat' USING ERRCODE = '22023';
    END IF;
  ELSIF v_btw IS NOT NULL AND v_btw !~ '^NL[0-9]{9}B[0-9]{2}$' THEN
    RAISE EXCEPTION 'BTW-nummer heeft geen geldig formaat' USING ERRCODE = '22023';
  END IF;

  IF length(v_contact_first_name) < 2
    OR length(v_contact_last_name) < 2
    OR position('@' in v_contact_email) <= 1
    OR v_contact_country_code <> '+31'
    OR v_contact_phone_digits !~ '^[1-9][0-9]{8}$'
  THEN
    RAISE EXCEPTION 'Controleer de contactpersoon gegevens' USING ERRCODE = '22023';
  END IF;

  IF length(trim(coalesce(p_billing_address_street, ''))) < 3
    OR v_billing_postal !~ '^[1-9][0-9]{3}[A-Z]{2}$'
    OR length(trim(coalesce(p_billing_address_city, ''))) < 2
  THEN
    RAISE EXCEPTION 'Controleer het factuuradres' USING ERRCODE = '22023';
  END IF;

  IF position('@' in v_invoice_email) <= 1 THEN
    RAISE EXCEPTION 'Factuurmail heeft geen geldig formaat' USING ERRCODE = '22023';
  END IF;

  SELECT d.payout_iban
  INTO v_existing_iban
  FROM public.client_payment_details d
  WHERE d.client_id = v_client_id;

  UPDATE public.clients
  SET
    company_name = trim(p_company_name),
    kvk = v_kvk,
    btw_number = v_btw,
    contact_name = v_contact_first_name || ' ' || v_contact_last_name,
    contact_email = v_contact_email,
    contact_phone = v_contact_country_code || v_contact_phone_digits,
    billing_address_street = trim(p_billing_address_street),
    billing_address_postal = v_billing_postal,
    billing_address_city = trim(p_billing_address_city),
    billing_address = trim(p_billing_address_street) || ', '
      || v_billing_postal || ' '
      || trim(p_billing_address_city),
    calculate_ere_enabled = coalesce(p_calculate_ere_enabled, false),
    -- Host-keuze van de BTW-status; een gewijzigde keuze reset de
    -- admin-bevestiging (identieke herbevestiging niet).
    vat_status = COALESCE(v_vat_status, vat_status),
    vat_status_confirmed_at = CASE
      WHEN v_vat_status IS NOT NULL AND v_vat_status IS DISTINCT FROM vat_status THEN NULL
      ELSE vat_status_confirmed_at END,
    vat_status_confirmed_by = CASE
      WHEN v_vat_status IS NOT NULL AND v_vat_status IS DISTINCT FROM vat_status THEN NULL
      ELSE vat_status_confirmed_by END,
    payment_onboarding_status = CASE
      WHEN v_existing_iban IS NULL THEN 'missing'
      ELSE payment_onboarding_status
    END
  WHERE id = v_client_id;

  INSERT INTO public.client_payment_details (
    client_id,
    invoice_email,
    account_holder_confirmed,
    status,
    submitted_at,
    updated_at
  )
  VALUES (
    v_client_id,
    v_invoice_email,
    false,
    'missing',
    v_now,
    v_now
  )
  ON CONFLICT (client_id) DO UPDATE
  SET
    invoice_email = EXCLUDED.invoice_email,
    status = CASE
      WHEN public.client_payment_details.payout_iban IS NULL THEN 'missing'
      ELSE public.client_payment_details.status
    END,
    updated_at = v_now;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_client_id,
    auth.uid(),
    'client_company_details_saved',
    'Klant heeft bedrijfs-, contact- en factuurgegevens opgeslagen',
    jsonb_build_object(
      'invoice_email', v_invoice_email,
      'contact_email', v_contact_email,
      'btw_number', v_btw,
      'vat_status', v_vat_status,
      'calculate_ere_enabled', coalesce(p_calculate_ere_enabled, false)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_portal_company_details(
  text, text, text, text, text, text, text, text, text, text, text, text, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_portal_company_details(
  text, text, text, text, text, text, text, text, text, text, text, text, boolean, text
) TO authenticated;

-- ─────────── get_portal_invoice_context: gesplitst org-adres + land ───────────
-- Scoping uit de live definitie behouden (portaal-klant óf interne gebruiker).
DROP FUNCTION IF EXISTS public.get_portal_invoice_context();

CREATE FUNCTION public.get_portal_invoice_context()
RETURNS TABLE (
  org_name text,
  org_kvk text,
  org_address text,
  org_address_street text,
  org_address_postal text,
  org_address_city text,
  org_country text,
  org_email text,
  org_btw_number text,
  org_iban text,
  org_bic text,
  payout_account_holder_name text,
  payout_iban text,
  payout_bic text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $$
DECLARE
  v_client_id uuid;
  v_internal boolean;
BEGIN
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  v_internal := app_private.is_internal(auth.uid());

  -- Alleen interne gebruikers of een echte portaal-klant krijgen gegevens.
  IF v_client_id IS NULL AND NOT COALESCE(v_internal, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.name, o.kvk, o.address,
    o.address_street, o.address_postal, o.address_city, o.country,
    o.email, o.btw_number, o.iban, o.bic,
    d.payout_account_holder_name, d.payout_iban, d.payout_bic
  FROM (
    SELECT name, kvk, address, address_street, address_postal, address_city,
           country, email, btw_number, iban, bic, created_at
    FROM public.organizations
    ORDER BY created_at
    LIMIT 1
  ) o
  LEFT JOIN public.client_payment_details d
    ON v_client_id IS NOT NULL AND d.client_id = v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_invoice_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_invoice_context() TO authenticated;
