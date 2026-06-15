-- next_settlement_invoice_number mag uitsluitend via de SECURITY DEFINER
-- approve-RPC lopen. REVOKE FROM PUBLIC volstaat niet: Supabase default
-- privileges geven anon/authenticated EXECUTE — expliciet intrekken.
REVOKE EXECUTE ON FUNCTION public.next_settlement_invoice_number() FROM anon, authenticated;

-- De reeks terugzetten: een test-call verbruikte nr 1 terwijl er nog geen
-- enkel ECF-nummer is uitgereikt (gecontroleerd: geen settlements-rij met
-- een ECF-nummer). De eerstvolgende goedkeuring krijgt zo weer ECF-...-00001.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.settlements WHERE invoice_number LIKE 'ECF-%') THEN
    PERFORM setval('public.settlements_invoice_seq', 1, false);
  END IF;
END $$;
