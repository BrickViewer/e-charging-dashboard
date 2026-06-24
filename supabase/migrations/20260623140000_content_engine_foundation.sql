-- Content-engine fundament (Fase 1): additief datamodel voor de geautomatiseerde,
-- mens-goedgekeurde blog-fabriek. Puur additief — bestaande blog-flow + blog-public
-- (expliciete kolomlijsten) blijven ongewijzigd. GEEN cron / externe triggers hier.
-- RLS spiegelt blog_posts (admin/manager/marketing beheren; geen publieke toegang).

create extension if not exists pg_trgm;

-- Hergebruik de bestaande updated_at-trigger-functie (zoals blog_posts/companies).
-- (app_private.has_role + tg_contacts_set_updated_at bestaan al.)

-- 1) content_topics — ideeën-/onderwerp-wachtrij ------------------------------
create table if not exists public.content_topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('web_research','rss','competitor','manual')),
  source_url text,
  source_name text,
  raw_title text not null,
  raw_summary text,
  -- dedup / novelty
  novelty_key text not null,
  novelty_score numeric,
  dedup_of uuid references public.content_topics(id) on delete set null,
  -- planning
  status text not null default 'idea'
    check (status in ('idea','approved_for_draft','drafting','drafted','scheduled','published','rejected')),
  target_keyword text,
  target_cluster text,
  assigned_category text,
  assigned_category_slug text,
  scheduled_for timestamptz,
  -- linkage + scoring
  blog_post_id uuid references public.blog_posts(id) on delete set null,
  seo_score int,
  aeo_score int,
  quality_score int,
  reviewer_notes text,
  rejected_reason text,
  generated_by text,            -- 'human' | 'agent:...'
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, novelty_key)
);
create index if not exists content_topics_status_idx on public.content_topics(status, scheduled_for);
create index if not exists content_topics_blog_post_idx on public.content_topics(blog_post_id);
drop trigger if exists content_topics_set_updated_at on public.content_topics;
create trigger content_topics_set_updated_at before update on public.content_topics
  for each row execute function public.tg_contacts_set_updated_at();

-- 2) content_seen_sources — "al-uitgemolken"-ledger / discovery-geheugen ------
create table if not exists public.content_seen_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id) on delete cascade,
  source_type text not null,
  source_url text not null,
  url_hash text not null,
  title text,
  title_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen int not null default 1,
  produced_topic_id uuid references public.content_topics(id) on delete set null,
  unique (organization_id, url_hash)
);
create index if not exists content_seen_sources_title_hash_idx on public.content_seen_sources(title_hash);

-- 3) blog_posts — provenance/pijplijn-kolommen (additief, nullable/defaulted) --
alter table public.blog_posts add column if not exists source_topic_id uuid references public.content_topics(id) on delete set null;
alter table public.blog_posts add column if not exists generated_by text;
alter table public.blog_posts add column if not exists seo_score int;
alter table public.blog_posts add column if not exists aeo_score int;
alter table public.blog_posts add column if not exists internal_link_suggestions jsonb not null default '[]'::jsonb;
alter table public.blog_posts add column if not exists meta_variants jsonb not null default '{}'::jsonb;
alter table public.blog_posts add column if not exists review_state text not null default 'none'
  check (review_state in ('none','needs_review','approved','changes_requested'));

-- 4) content_distributions — kanaal-agnostische distributie-ruggengraat -------
create table if not exists public.content_distributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id) on delete cascade,
  content_ref_type text not null default 'blog_post' check (content_ref_type in ('blog_post')),
  content_ref_id uuid not null,
  channel text not null check (channel in ('linkedin','newsletter','x','site')),
  status text not null default 'pending' check (status in ('pending','queued','scheduled','sent','failed','skipped')),
  payload jsonb not null default '{}'::jsonb,
  external_id text,
  error text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_distributions_ref_idx on public.content_distributions(content_ref_type, content_ref_id);
create index if not exists content_distributions_channel_idx on public.content_distributions(channel, status, scheduled_for);
drop trigger if exists content_distributions_set_updated_at on public.content_distributions;
create trigger content_distributions_set_updated_at before update on public.content_distributions
  for each row execute function public.tg_contacts_set_updated_at();

-- 5) content_engine_settings — versie-config + kill-switch --------------------
create table if not exists public.content_engine_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id) on delete cascade,
  version int not null default 1,
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists content_engine_settings_set_updated_at on public.content_engine_settings;
create trigger content_engine_settings_set_updated_at before update on public.content_engine_settings
  for each row execute function public.tg_contacts_set_updated_at();

-- Default-instellingen (alles UIT — discovery/generatie pas aan bij go-live).
insert into public.content_engine_settings (organization_id, version, settings, is_active)
select '00000000-0000-0000-0000-000000000001', 1,
  jsonb_build_object(
    'discovery_enabled', false,
    'generation_enabled', false,
    'min_quality', 75, 'min_seo', 70, 'min_aeo', 65,
    'feeds', '[]'::jsonb, 'competitors', '[]'::jsonb,
    'channels', jsonb_build_object('linkedin', false, 'newsletter', false)
  ), true
where not exists (select 1 from public.content_engine_settings where is_active);

-- RLS — admin/manager/marketing beheren; geen publieke toegang -----------------
alter table public.content_topics        enable row level security;
alter table public.content_seen_sources  enable row level security;
alter table public.content_distributions enable row level security;
alter table public.content_engine_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['content_topics','content_seen_sources','content_distributions','content_engine_settings'] loop
    execute format($f$
      drop policy if exists "Marketing manage %1$s" on public.%1$s;
      create policy "Marketing manage %1$s" on public.%1$s for all to authenticated
        using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'))
        with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'));
    $f$, t);
  end loop;
end $$;
