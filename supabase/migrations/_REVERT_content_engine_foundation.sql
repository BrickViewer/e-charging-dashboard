-- OMKEER-migratie voor 20260623140000_content_engine_foundation.sql.
-- NIET automatisch toepassen — alleen handmatig draaien om de content-engine volledig
-- terug te draaien. Verwijdert de additieve content_*-tabellen + de blog_posts-pijplijnkolommen.
-- (blog_posts zelf en alle bestaande data blijven intact.)

alter table public.blog_posts drop column if exists review_state;
alter table public.blog_posts drop column if exists meta_variants;
alter table public.blog_posts drop column if exists internal_link_suggestions;
alter table public.blog_posts drop column if exists aeo_score;
alter table public.blog_posts drop column if exists seo_score;
alter table public.blog_posts drop column if exists generated_by;
alter table public.blog_posts drop column if exists source_topic_id;

drop table if exists public.content_distributions cascade;
drop table if exists public.content_seen_sources cascade;
drop table if exists public.content_engine_settings cascade;
drop table if exists public.content_topics cascade;
-- pg_trgm laten staan (kan elders gebruikt worden).
