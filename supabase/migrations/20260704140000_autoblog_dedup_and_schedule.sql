-- Autoblog fase 2: (1) onderwerp-selectie met zoekwoord-dedup (anti-kannibalisatie) zodat 3x/week elke
-- run een DISTINCT zoekwoord target, en (2) een idempotente seed van de cadans-instelling voor de UI.

-- content_select_autoblog_topics: top-N onderwerpen op seo_opportunity die nog geen blog zijn, waarvan het
-- gekoppelde zoekwoord nog niet door een bestaande blog is gedekt, en maximaal 1 per zoekwoord.
-- Onderwerpen zonder gekoppeld zoekwoord (matched_keyword_id null) zijn altijd toegestaan.
create or replace function public.content_select_autoblog_topics(p_limit int default 1)
returns setof public.content_topics
language sql
stable
security definer
set search_path to 'public'
as $$
  with covered as (
    select distinct matched_keyword_id
    from public.content_topics
    where blog_post_id is not null and matched_keyword_id is not null
  ),
  ranked as (
    select t.id,
      row_number() over (
        partition by t.matched_keyword_id
        order by t.seo_opportunity desc nulls last, t.created_at desc
      ) as rn_kw
    from public.content_topics t
    where t.status in ('idea','approved_for_draft')
      and t.blog_post_id is null
      and (
        t.matched_keyword_id is null
        or not exists (select 1 from covered c where c.matched_keyword_id = t.matched_keyword_id)
      )
  )
  select ct.*
  from public.content_topics ct
  join ranked r on r.id = ct.id
  where ct.matched_keyword_id is null or r.rn_kw = 1
  order by ct.seo_opportunity desc nulls last, ct.created_at desc
  limit greatest(1, p_limit);
$$;

revoke all on function public.content_select_autoblog_topics(int) from public, anon, authenticated;
grant execute on function public.content_select_autoblog_topics(int) to service_role;

-- Cadans-instelling voor de "volgende blog"-indicator (ma/wo/vr, 08:00 Europe/Amsterdam). Idempotent:
-- alleen zetten als hij nog niet bestaat, zodat een latere aanpassing niet wordt overschreven.
update public.content_engine_settings
set settings = settings || jsonb_build_object(
      'autoblog_schedule',
      coalesce(settings->'autoblog_schedule', jsonb_build_object('days', jsonb_build_array(1,3,5), 'hour', 8))
    )
where is_active;
