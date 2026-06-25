-- Contentmachine: publicatiedatum vastleggen, bronnen terug naar strikt zakelijk, en alle eerder
-- opgehaalde besprekingspunten wissen voor een verse, gefilterde pull (max 2 weken oud).

-- 1) Publicatiedatum van het bronartikel.
alter table public.content_topics add column if not exists source_published_at timestamptz;

-- 2) content_ingest_source uitbreiden met p_published_at (rest van dedup/noviteit ongewijzigd).
drop function if exists public.content_ingest_source(text, text, text, text, text, numeric);
create or replace function public.content_ingest_source(
  p_source_type text,
  p_source_url text,
  p_source_name text,
  p_title text,
  p_summary text default null,
  p_novelty_threshold numeric default 0.5,
  p_published_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_url_hash text;
  v_title_hash text;
  v_key text;
  v_sim numeric;
  v_novelty numeric;
  v_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' then return null; end if;
  v_url_hash   := md5(lower(coalesce(p_source_url, '')));
  v_title_hash := md5(lower(btrim(p_title)));
  v_key        := trim(both '-' from regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g'));
  if v_key = '' then return null; end if;

  if p_source_url is not null and p_source_url <> '' then
    if exists (select 1 from public.content_seen_sources where organization_id = v_org and url_hash = v_url_hash) then
      update public.content_seen_sources set last_seen_at = now(), times_seen = times_seen + 1
        where organization_id = v_org and url_hash = v_url_hash;
      return null;
    end if;
    insert into public.content_seen_sources (organization_id, source_type, source_url, url_hash, title, title_hash)
      values (v_org, p_source_type, p_source_url, v_url_hash, p_title, v_title_hash);
  end if;

  select id into v_id from public.content_topics where organization_id = v_org and novelty_key = v_key limit 1;
  if v_id is not null then return v_id; end if;

  select coalesce(max(sim), 0) into v_sim from (
    select similarity(lower(title), lower(p_title)) as sim from public.blog_posts where status = 'gepubliceerd'
    union all
    select similarity(lower(raw_title), lower(p_title)) from public.content_topics where status <> 'rejected'
  ) s;
  v_novelty := round((1 - v_sim)::numeric, 3);

  insert into public.content_topics (organization_id, source_type, source_url, source_name, raw_title, raw_summary,
    novelty_key, novelty_score, generated_by, status, rejected_reason, source_published_at)
  values (v_org, p_source_type, p_source_url, p_source_name, p_title, p_summary,
    v_key, v_novelty, 'discovery',
    case when v_novelty < p_novelty_threshold then 'rejected' else 'idea' end,
    case when v_novelty < p_novelty_threshold then 'Te lage noviteit (lijkt op bestaande content)' else null end,
    p_published_at)
  on conflict (organization_id, novelty_key) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.content_ingest_source(text, text, text, text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.content_ingest_source(text, text, text, text, text, numeric, timestamptz) to service_role;

-- 3) Bronnen terug naar strikt zakelijk (consumenten-/auto-bronnen verwijderd).
update public.content_engine_settings
set settings = settings || jsonb_build_object('feeds', '[
  {"url":"https://elaad.nl/feed/","name":"ElaadNL"},
  {"url":"https://nklnederland.nl/feed/","name":"NKL Nederland"},
  {"url":"https://eviolin.nl/feed/","name":"eViolin"},
  {"url":"https://netbeheernederland.nl/rss.xml","name":"Netbeheer Nederland"},
  {"url":"https://solarmagazine.nl/rss.xml","name":"Solar & Storage Magazine"},
  {"url":"https://www.energystoragenl.nl/feed/","name":"Energy Storage NL"},
  {"url":"https://www.wattisduurzaam.nl/feed/","name":"WattisDuurzaam"},
  {"url":"https://www.pbl.nl/feed/topic/13/article/rss.xml","name":"PBL klimaat & energie"},
  {"url":"https://www.change.inc/feed/","name":"Change Inc"},
  {"url":"https://www.duurzaam-ondernemen.nl/nieuws/feed/","name":"Duurzaam Ondernemen"}
]'::jsonb)
where is_active = true;

-- 4) Alle eerder opgehaalde besprekingspunten + dedup-ledger wissen (handmatige ideeën blijven).
delete from public.content_topics where source_type in ('rss', 'competitor');
delete from public.content_seen_sources;
