-- Thema-spreiding voor de autoblog: na een publicatie is dat keyword-CLUSTER
-- 21 dagen "afgekoeld" (eff × 0,35), zodat niet week na week hetzelfde thema
-- (VvE…) wint. Geen harde uitsluiting: is er verder niets, dan kan het cluster
-- alsnog gekozen worden. Verder identiek aan de vorige versie
-- (autoblog_cluster_pillar_weighted_selection + recency + prestatie-bonus).

create or replace function public.content_select_autoblog_topics(p_limit integer default 1)
returns setof content_topics
language sql
stable security definer
set search_path to 'public'
as $$
  with covered as (
    select distinct matched_keyword_id
    from public.content_topics
    where blog_post_id is not null and matched_keyword_id is not null
  ),
  cluster_state as (
    select k.cluster,
      bool_or(k.is_pillar) as has_pillar_kw,
      count(t.id) filter (where t.blog_post_id is not null) as written,
      count(t.id) filter (where t.blog_post_id is not null and k.is_pillar) as pillar_written
    from public.content_keywords k
    left join public.content_topics t on t.matched_keyword_id = k.id
    group by k.cluster
  ),
  cluster_perf as (
    select cluster, perf_score, impressions_28d, leads
    from public.content_cluster_performance()
  ),
  -- Cooldown: clusters waarvan recent (21d) een blog is gepubliceerd.
  recent_pub as (
    select k2.cluster, max(bp.published_at) as last_pub
    from public.blog_posts bp
    join public.content_topics t2 on t2.blog_post_id = bp.id
    join public.content_keywords k2 on k2.id = t2.matched_keyword_id
    where bp.status = 'gepubliceerd' and bp.published_at is not null and k2.cluster is not null
    group by k2.cluster
  ),
  scored as (
    select t.id, t.matched_keyword_id, t.created_at,
      -- Multiplicatieve demping op het HELE eff: een vers-gepubliceerd cluster
      -- zakt ver naar achteren maar blijft kiesbaar als de pool leeg is.
      case
        when rp.last_pub is not null and rp.last_pub > now() - interval '21 days' then 0.35
        else 1.0
      end * (
        0.68 * coalesce(t.seo_opportunity, 0)
        + 0.14 * case
                   when t.source_published_at is null then 0.3
                   else exp(- greatest(0, extract(epoch from (now() - t.source_published_at)) / 86400.0) / 14.0)
                 end
        + 0.18 * case
                   when t.matched_keyword_id is null then 0.35
                   when k.is_pillar and coalesce(cs.pillar_written, 0) = 0 then 1.0
                   when k.is_pillar then 0.55
                   when coalesce(cs.has_pillar_kw, false) and coalesce(cs.pillar_written, 0) = 0 then 0.25
                   else 0.50 + 0.15 * least(coalesce(cs.written, 0), 3) / 3.0
                 end
        -- ADDITIEVE prestatie-bonus (zelflerend): 0 tot 0.15, alleen bij voldoende signaal.
        + 0.15 * case
                   when cp.cluster is not null and (coalesce(cp.impressions_28d, 0) >= 50 or coalesce(cp.leads, 0) >= 1)
                   then coalesce(cp.perf_score, 0)
                   else 0
                 end
      ) as eff
    from public.content_topics t
    left join public.content_keywords k on k.id = t.matched_keyword_id
    left join cluster_state cs on cs.cluster = k.cluster
    left join cluster_perf cp on cp.cluster = k.cluster
    left join recent_pub rp on rp.cluster = k.cluster
    where t.status in ('idea','approved_for_draft')
      and t.blog_post_id is null
      and (
        t.matched_keyword_id is null
        or not exists (select 1 from covered c where c.matched_keyword_id = t.matched_keyword_id)
      )
  ),
  ranked as (
    select id, matched_keyword_id,
      row_number() over (
        partition by matched_keyword_id
        order by eff desc, created_at desc
      ) as rn_kw
    from scored
  )
  select ct.*
  from public.content_topics ct
  join scored s on s.id = ct.id
  join ranked r on r.id = ct.id
  where ct.matched_keyword_id is null or r.rn_kw = 1
  order by s.eff desc, ct.seo_opportunity desc nulls last, ct.created_at desc
  limit greatest(1, p_limit);
$$;
