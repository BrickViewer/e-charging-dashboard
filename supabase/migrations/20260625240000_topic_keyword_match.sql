-- Laag B van de SEO-blogmotor: koppel opgehaalde onderwerpen aan de zoekvraag die ze raken, en bereken
-- een seo_opportunity-score om de agenda op te ranken. Matching via pg_trgm-similarity (gratis, geen LLM).

alter table public.content_topics add column if not exists matched_keyword_id uuid
  references public.content_keywords(id) on delete set null;
alter table public.content_topics add column if not exists match_strength numeric;
alter table public.content_topics add column if not exists seo_opportunity numeric;
create index if not exists content_topics_seo_opp_idx on public.content_topics(status, seo_opportunity desc);

-- Beste keyword per idea-topic boven de drempel; seo_opportunity = priority*0.5 + match*0.3 + novelty*0.2.
-- word_similarity (i.p.v. similarity) want het zoekwoord is kort en de titel/samenvatting lang: word_similarity
-- zoekt het beste venster van het zoekwoord in de tekst. Drempel 0.5; het blijft een suggestie die de mens in
-- het overleg beoordeelt (de gekoppelde zoekvraag wordt getoond).
create or replace function public.content_match_topics_to_keywords(
  p_threshold numeric default 0.5,
  p_only_unmatched boolean default false
) returns int
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_count int := 0;
begin
  with cand as (
    select t.id as topic_id, k.id as keyword_id, k.priority,
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
        seo_opportunity = round(least(1.0::numeric, c.priority*0.5 + c.sim::numeric*0.3 + c.nov*0.2), 3)
  from cand c
  where c.topic_id = t.id and c.rn = 1 and c.sim >= p_threshold;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.content_match_topics_to_keywords(numeric, boolean) from public, anon, authenticated;
grant execute on function public.content_match_topics_to_keywords(numeric, boolean) to service_role;
