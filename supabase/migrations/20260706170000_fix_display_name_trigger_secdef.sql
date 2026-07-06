-- set_project_location_display_name (BEFORE-trigger op project_locations) draaide als de
-- AANROEPER en resolvet app_private.build_object_label bij naam. Sinds de security-hardening
-- heeft service_role geen USAGE meer op schema app_private, waardoor élke project_locations-
-- write vanuit edge functions faalde met 42501 (PostgREST 403) — stil genegeerd door
-- object-ensure-folder/quote-sharepoint-off (die hun update-resultaat niet checkten), met
-- ontbrekende mapreferenties en dubbele SharePoint-dossiers als gevolg (o.a. objecten 208/209,
-- 2026-07-06). SECURITY DEFINER laat de functie als eigenaar resolven zonder de hardening
-- terug te draaien; search_path vastgezet conform de overige triggers.
--
-- Bewust NIET aangepast: app_private.pin_session_client_ownership (charging_sessions) zit in
-- dezelfde audit-klasse maar resolvet geen app_private-namen in zijn body (alleen
-- current_setting) en werkt aantoonbaar onder service_role (eflux-sync).
alter function app_private.set_project_location_display_name()
  security definer
  set search_path = public, app_private;
