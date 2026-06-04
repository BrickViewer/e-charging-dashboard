-- Future-proof: één canonieke bron voor maand→UTC-grenzen op Europe/Amsterdam-tijd.
-- Lost de UTC-maandtoewijzing op: een sessie op 1 jan 00:30 NL hoort bij januari,
-- niet bij december. DST- en schrikkeljaar-correct via Postgres' tz-database.
-- Pure datumrekenkunde (geen tabel-toegang) → veilig breed te granten.
-- Gebruikt door supabase/functions/aggregate-settlements (sessie-buckets) en door
-- de factuur-specificatie (apps/admin/src/services/sessions.ts).
CREATE OR REPLACE FUNCTION public.amsterdam_month_bounds(p_year integer, p_month integer)
RETURNS TABLE(start_ts timestamptz, end_ts timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (make_date(p_year, p_month, 1)::timestamp AT TIME ZONE 'Europe/Amsterdam') AS start_ts,
    ((make_date(p_year, p_month, 1) + interval '1 month')::timestamp AT TIME ZONE 'Europe/Amsterdam') AS end_ts;
$$;

COMMENT ON FUNCTION public.amsterdam_month_bounds(integer, integer) IS
  'Geeft [start,end) UTC-instant van een kalendermaand op Europe/Amsterdam-tijd. Bron van waarheid voor maand-toewijzing van laadsessies (aggregate-settlements + factuur-specificatie).';

GRANT EXECUTE ON FUNCTION public.amsterdam_month_bounds(integer, integer) TO authenticated, service_role;
