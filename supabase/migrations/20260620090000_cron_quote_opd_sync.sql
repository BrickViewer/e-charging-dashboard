-- Uurlijkse retry: getekende offertes (OPD) die nog niet in SharePoint staan
-- alsnog vanuit Supabase-storage naar de Opdracht-submap uploaden.
-- cron.schedule upsert op jobname, dus idempotent bij heruitvoeren.
select cron.schedule(
  'quote-opd-sync',
  '7 * * * *',
  $$ select public.invoke_edge_function('quote-opd-sync', '{}'::jsonb); $$
);
