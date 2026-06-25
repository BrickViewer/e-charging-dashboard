-- Security hardening (audit deel 2): trek alle rechten van de anon-rol op het public-schema in.
-- Geverifieerd: de apps lezen geen tabellen en roepen geen RPC's aan als anon (publieke pagina's gaan
-- via edge functions met service_role). anon heeft dus niets nodig. Hiermee is RLS niet langer de ENIGE
-- vangnet: een toekomstige tabel zonder RLS is niet meer automatisch wereldwijd leesbaar via anon.
-- authenticated (192 directe reads) en service_role (edges) blijven volledig ongemoeid.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- Voorkom regressie: nieuwe objecten in public krijgen geen anon-rechten meer (objecten gemaakt door de
-- migratie-rol). Supabase's eigen default-grants kunnen dit per dashboard-actie nog overschrijven; de
-- get_advisors-check blijft de bewaking.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
