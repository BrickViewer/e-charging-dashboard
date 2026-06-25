-- Laag C van de SEO-blogmotor: per onderwerp een gespreksvraag + achtergrond (door Claude gegenereerd),
-- zodat het team een opname kan maken met hun visie. suggested_angle = aangescherpte hoek voor de blog.
alter table public.content_topics add column if not exists conversation_question text;
alter table public.content_topics add column if not exists background text;
alter table public.content_topics add column if not exists suggested_angle text;
alter table public.content_topics add column if not exists brief_generated_at timestamptz;
