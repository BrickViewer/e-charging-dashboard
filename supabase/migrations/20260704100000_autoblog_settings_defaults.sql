-- Autoblog (autonome blog-tak): seed de drie instellings-vlaggen in content_engine_settings.settings
-- als ze nog niet bestaan. Idempotent en NIET-overschrijvend (coalesce per key), zodat de UI-toggles
-- vooraf de juiste stand tonen. Geen DDL, geen cron. De edge behandelt ontbrekende keys sowieso als
-- uit/1, dus deze migratie is puur voor een nette begintoestand.
--   autoblog_enabled     : master aan/uit voor de cron-run (default false = installeren maar niet draaien)
--   autoblog_autopublish : automatisch publiceren wanneer de blog door de kwaliteitspoort komt (default false)
--   autoblog_per_run     : aantal blogs per run (default 1)
update public.content_engine_settings
set settings = settings
    || jsonb_build_object('autoblog_enabled',     coalesce(settings->'autoblog_enabled',     'false'::jsonb))
    || jsonb_build_object('autoblog_autopublish', coalesce(settings->'autoblog_autopublish', 'false'::jsonb))
    || jsonb_build_object('autoblog_per_run',     coalesce(settings->'autoblog_per_run',     '1'::jsonb))
where is_active;
