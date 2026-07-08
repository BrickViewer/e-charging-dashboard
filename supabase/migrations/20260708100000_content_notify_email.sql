-- Vangnet-notificatie content-engine: seed notify_email in content_engine_settings.settings.
-- De edges (content-autoblog/content-revise) mailen dit adres wanneer een autoblog-run eindigt
-- ZONDER gepubliceerde blog (concept bleef in review, lege pool, ontbrekende sleutel, run-fout).
-- Leeg = geen mail. Idempotent en NIET-overschrijvend (coalesce per key), zelfde patroon als
-- 20260704100000_autoblog_settings_defaults.sql. Geen DDL.
update public.content_engine_settings
set settings = settings
    || jsonb_build_object('notify_email', coalesce(settings->'notify_email', '"info@e-charging.nl"'::jsonb))
where is_active;
