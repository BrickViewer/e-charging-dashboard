-- Data-laag: echte zoekdata (DataForSEO) + opportunity-score (laaghangend fruit) + clustering. Additief; alle
-- kolommen nullable, zodat de bestaande deterministische flow ongewijzigd blijft tot er data binnenkomt.

alter table public.content_keywords add column if not exists search_volume int;
alter table public.content_keywords add column if not exists keyword_difficulty numeric;
alter table public.content_keywords add column if not exists competition numeric;
alter table public.content_keywords add column if not exists cpc numeric;
alter table public.content_keywords add column if not exists metrics_at timestamptz;
alter table public.content_keywords add column if not exists serp_gap numeric;        -- 0..1, hoger = zwakkere SERP = meer kans
alter table public.content_keywords add column if not exists serp_notes text;
alter table public.content_keywords add column if not exists serp_checked_at timestamptz;
alter table public.content_keywords add column if not exists opportunity numeric;       -- gecombineerde kansscore 0..1
alter table public.content_keywords add column if not exists is_pillar boolean not null default false;
create index if not exists content_keywords_opportunity_idx on public.content_keywords(status, opportunity desc nulls last);

-- Laaghangend-fruit-score: relevantie (intent/zakelijk) + gedempt volume + winbaarheid (lage difficulty) + SERP-gap.
-- B2B: volume bewust gedempt (log + cap ~1000) zodat B2C-volumetermen niet domineren. Val terug op priority bij geen data.
create or replace function public.content_keyword_opportunity(
  p_priority numeric,
  p_volume int,
  p_kd numeric,
  p_serp_gap numeric
) returns numeric
language sql immutable set search_path to 'public' as $$
  with v as (
    select case when p_volume is null then null
                else least(1.0, ln(1 + greatest(p_volume, 0)) / ln(1 + 1000)) end as vol_n
  )
  select round((
    case
      when p_volume is null and p_kd is null then p_priority::double precision
      else least(1.0,
             0.35 * coalesce(p_priority, 0.5)
           + 0.25 * coalesce((select vol_n from v), 0.4)
           + 0.25 * coalesce(1 - (p_kd / 100.0), 0.5)
           + 0.15 * coalesce(p_serp_gap, 0.0)
           )
    end
  )::numeric, 3);
$$;
revoke all on function public.content_keyword_opportunity(numeric, int, numeric, numeric) from public, anon, authenticated;
grant execute on function public.content_keyword_opportunity(numeric, int, numeric, numeric) to service_role;

-- Matcher: gebruik de echte opportunity-score zodra die er is (anders priority). Verder ongewijzigd t.o.v. eerder.
create or replace function public.content_match_topics_to_keywords(
  p_threshold numeric default 0.5,
  p_only_unmatched boolean default false
) returns int
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_count int := 0;
begin
  with cand as (
    select t.id as topic_id, k.id as keyword_id, coalesce(k.opportunity, k.priority) as score,
           word_similarity(lower(k.query), lower(t.raw_title || ' ' || coalesce(t.raw_summary,''))) as sim,
           coalesce(t.novelty_score, 0.5) as nov,
           row_number() over (
             partition by t.id
             order by word_similarity(lower(k.query), lower(t.raw_title || ' ' || coalesce(t.raw_summary,''))) desc
           ) as rn
    from public.content_topics t
    join public.content_keywords k
      on k.organization_id = t.organization_id and k.status = 'active'
    where t.organization_id = v_org
      and t.status = 'idea'
      and (not p_only_unmatched or t.matched_keyword_id is null)
  )
  update public.content_topics t
    set matched_keyword_id = c.keyword_id,
        match_strength = round(c.sim::numeric, 3),
        seo_opportunity = round(least(1.0::numeric, c.score*0.5 + c.sim::numeric*0.3 + c.nov*0.2), 3)
  from cand c
  where c.topic_id = t.id and c.rn = 1 and c.sim >= p_threshold;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Tier-1 clustering (altijd beschikbaar): markeer per cluster het hoogst scorende zoekwoord als pijler.
create or replace function public.content_recluster_keywords() returns int
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_count int := 0;
begin
  update public.content_keywords set is_pillar = false where organization_id = v_org and is_pillar = true;
  with ranked as (
    select id, row_number() over (
        partition by cluster order by coalesce(opportunity, priority) desc nulls last, times_seen desc
      ) as rn
    from public.content_keywords
    where organization_id = v_org and status = 'active' and cluster is not null and cluster <> ''
  )
  update public.content_keywords k set is_pillar = true
  from ranked r where r.id = k.id and r.rn = 1;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.content_recluster_keywords() from public, anon, authenticated;
grant execute on function public.content_recluster_keywords() to service_role;
