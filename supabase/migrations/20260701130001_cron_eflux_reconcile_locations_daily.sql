-- Dagelijkse reconcile: verberg/verwijder locaties die in e-Flux/Road geen laadpunt (meer) hebben.
-- Draait om 03:15 (na de nachtelijke aggregate om 02:00). invoke_edge_function stuurt de x-internal-secret mee.
select cron.schedule(
  'eflux-reconcile-locations-daily',
  '15 3 * * *',
  $$ select public.invoke_edge_function('eflux-reconcile-locations', '{}'::jsonb); $$
);
