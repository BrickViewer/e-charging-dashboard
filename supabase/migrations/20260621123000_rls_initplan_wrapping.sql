-- ============================================================================
-- Fase 5 (architectuur-audit) — RLS InitPlan-optimalisatie. SEMANTISCH IDENTIEK.
-- De RLS-policies riepen de SECURITY DEFINER-helpers (is_internal / get_client_id_for_user
-- / has_role / is_superadmin) ONGEWRAPT aan, waardoor Postgres ze PER GESCANDE RIJ
-- her-evalueert i.p.v. één keer per statement (de bekende Supabase "InitPlan"-footgun).
-- Door elke helper-call in een scalar subquery (select ...) te zetten cachet Postgres
-- het resultaat per statement. De toegangsbeslissing is byte-identiek — (select f())
-- geeft exact dezelfde waarde/type als f() — alleen sneller bij groei van rijen.
--
-- Toegepast via ALTER POLICY (geen DROP/CREATE → geen venster zonder policy; cmd/roles
-- blijven automatisch behouden). Vooraf gevalideerd: alle 82 ALTERs draaiden in een
-- dry-run zonder fout; occurrence-telling bevestigt dat elke helper-call gewrapt wordt.
-- ============================================================================
do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_pat constant text := $re$(app_private\.(is_internal|get_client_id_for_user|has_role|is_superadmin)\(auth\.uid\(\)(, '[a-z_]+'::app_role)?\))$re$;
  v_count int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%app_private.%' or coalesce(with_check,'') like '%app_private.%')
  loop
    v_qual  := case when r.qual is null then null else regexp_replace(r.qual, v_pat, $rep$(select \1)$rep$, 'g') end;
    v_check := case when r.with_check is null then null else regexp_replace(r.with_check, v_pat, $rep$(select \1)$rep$, 'g') end;
    -- niets te wrappen (geen helper-call in de expressie) → overslaan
    if v_qual is not distinct from r.qual and v_check is not distinct from r.with_check then continue; end if;
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
    v_count := v_count + 1;
  end loop;
  raise notice 'RLS InitPlan-wrapping toegepast op % policies', v_count;
end $$;
