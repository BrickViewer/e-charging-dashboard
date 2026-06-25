-- Content-machine stap 2: opname-naar-blog. Houdt de opname/het transcript vast + de link naar het
-- gegenereerde onderwerp/concept. Audio-upload + echte transcriptie komen later (audio_path + edge-stub).
create table if not exists public.content_recordings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id) on delete cascade,
  title text not null,
  recorded_on date,
  transcript text,
  audio_path text,                         -- voor later (audio-upload + transcriptie)
  status text not null default 'nieuw',    -- 'nieuw' | 'verwerkt'
  topic_id uuid references public.content_topics(id) on delete set null,
  blog_post_id uuid references public.blog_posts(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_recordings enable row level security;

-- Zelfde rol-model als de overige content_*-tabellen.
create policy "Marketing manage content_recordings" on public.content_recordings
  for all to authenticated
  using (app_private.has_role(auth.uid(), 'admin'::app_role) or app_private.has_role(auth.uid(), 'manager'::app_role) or app_private.has_role(auth.uid(), 'marketing'::app_role))
  with check (app_private.has_role(auth.uid(), 'admin'::app_role) or app_private.has_role(auth.uid(), 'manager'::app_role) or app_private.has_role(auth.uid(), 'marketing'::app_role));

drop trigger if exists content_recordings_set_updated_at on public.content_recordings;
create trigger content_recordings_set_updated_at before update on public.content_recordings
  for each row execute function public.update_updated_at_column();

-- Least-privilege: authenticated via RLS, service_role voor de edge; anon krijgt niets.
grant select, insert, update, delete on public.content_recordings to authenticated;
grant all on public.content_recordings to service_role;
revoke all on public.content_recordings from anon;
