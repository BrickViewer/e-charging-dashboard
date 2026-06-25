-- Security hardening: verwijder de impliciete Postgres-PUBLIC EXECUTE-grant van de aanroepbare
-- SECURITY DEFINER applicatie-RPC's die anon nog kon bereiken via PUBLIC. Ze self-checken al
-- (anon → denied), maar zo kan anon ze niet eens meer aanroepen (defense-in-depth). Geverifieerd:
-- alle vier hebben een EXPLICIETE authenticated- én service_role-grant, dus die paden blijven werken.
-- (Trigger-functies + pg_trgm-utils laten we staan: triggers zijn niet via de API aanroepbaar en
-- pg_trgm-verplaatsing is apart/risicovol.)

revoke execute on function public.move_stage(uuid, integer) from public;
revoke execute on function public.reorder_leads(jsonb) from public;
revoke execute on function public.get_portal_dashboard_kpis() from public;
revoke execute on function public.admin_get_cron_status() from public;
