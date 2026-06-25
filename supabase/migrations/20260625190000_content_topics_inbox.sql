-- Content-machine stap 1: onderwerpen-inbox bovenop content_topics.
-- discussed_at: open (null) / besproken (gezet) — lichte team-triage in de wekelijkse sessie.
-- created_by default = auth.uid() zodat de inbox automatisch de inbrenger (auteur) toont,
-- zonder client-side bedrading. Bestaande rijen en de kanban-pijplijn blijven werken.
alter table public.content_topics add column if not exists discussed_at timestamptz;
alter table public.content_topics alter column created_by set default auth.uid();
