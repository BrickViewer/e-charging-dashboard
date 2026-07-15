-- Branche-poort ("brand fit") voor de blogmachine. Aanleiding: op 15 juli won "heavy duty
-- laadplein" (ElaadNL-RSS) de onderwerpselectie en op 13 juli een Bentley-persbericht — geen
-- enkele laag (discovery, matching, selectie, prompts) toetste of een onderwerp bij de
-- doelgroep past (VvE's, kantoren/bedrijfspanden, vastgoedeigenaren, parkeerterreinen).
-- Drie lagen: (1) Haiku-batchscore bij discovery-ingest → brand_fit + auto-reject onder de
-- drempel (edge: content-discovery), (2) hard filter + multiplicatieve weging in de
-- selectie-RPC (hier), (3) BRANCHECHECK-waakhond in de research-stap (edge: content-autoblog).

-- 1) Score-kolommen. NULL = nog niet gescoord (de dagelijkse discovery-run werkt de pool
--    achterstevoren bij; de selectie behandelt NULL als neutraal 0.7 zodat de pool nooit
--    leegvalt vóór de backfill klaar is).
alter table public.content_topics add column if not exists brand_fit numeric;
alter table public.content_topics add column if not exists brand_fit_reason text;

-- 2) Instelbare drempel (zonder edge-deploy bij te stellen via de instellingen-UI/SQL).
update public.content_engine_settings
set settings = settings || jsonb_build_object(
  'brand_fit_threshold', coalesce(settings->'brand_fit_threshold', to_jsonb(0.4))
)
where is_active = true;

-- 3) Keyword-hygiëne: bestaande off-brand zoekwoorden archiveren en nieuwe aan de bron weren.
--    (Google Autocomplete leverde suggesties als "laadplein zwaar vervoer" die via de
--    tekst-matching topics als on-brand lieten ogen.)
update public.content_keywords
set status = 'archived'
where status = 'active'
  and query ~* '(vrachtwagen|zwaar vervoer|zwaar transport|heavy duty|truck|snellaadcorridor|e-truck|bestelbus)';

create or replace function public.content_ingest_keyword(
  p_query text,
  p_seed text default null,
  p_cluster text default null,
  p_intent text default 'informational',
  p_audience text default null,
  p_source text default 'autocomplete'
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_key text;
  v_words int;
  v_iw numeric; v_lw numeric; v_aw numeric; v_priority numeric;
  v_intent text := lower(coalesce(p_intent, 'informational'));
  v_id uuid;
begin
  if coalesce(btrim(p_query),'') = '' then return null; end if;
  -- Branche-guard: zoekwoorden buiten de doelgroep (zwaar transport e.d.) komen er niet in.
  if p_query ~* '(vrachtwagen|zwaar vervoer|zwaar transport|heavy duty|truck|snellaadcorridor|e-truck|bestelbus)' then
    return null;
  end if;
  v_key := btrim(regexp_replace(lower(p_query), '[^a-z0-9]+', ' ', 'g'));
  if v_key = '' then return null; end if;
  if v_intent not in ('informational','commercial','transactional','navigational') then v_intent := 'informational'; end if;

  select id into v_id from public.content_keywords
    where organization_id = v_org and normalized_key = v_key limit 1;
  if v_id is not null then
    update public.content_keywords set times_seen = times_seen + 1, last_seen_at = now() where id = v_id;
    return v_id;
  end if;

  v_words := coalesce(array_length(regexp_split_to_array(v_key, ' '), 1), 1);
  v_iw := case v_intent when 'transactional' then 1.0 when 'commercial' then 0.8
                        when 'informational' then 0.5 else 0.3 end;
  v_lw := least(1.0, greatest(0.2, v_words / 4.0));
  v_aw := case when coalesce(p_audience,'') <> '' then 1.0 else 0.4 end;
  v_priority := round(least(1.0, v_iw*0.5 + v_lw*0.25 + v_aw*0.25), 3);

  insert into public.content_keywords
    (organization_id, query, normalized_key, seed, cluster, intent, audience, source, priority)
  values (v_org, btrim(p_query), v_key, p_seed, p_cluster, v_intent, nullif(btrim(coalesce(p_audience,'')),''), coalesce(p_source,'autocomplete'), v_priority)
  on conflict (organization_id, normalized_key) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.content_ingest_keyword(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.content_ingest_keyword(text,text,text,text,text,text) to service_role;

-- 4) Selectie-RPC met branche-poort: hard filter onder de (instelbare) drempel + multiplicatieve
--    brand_fit-weging op eff. Verder identiek aan de vorige versie (cluster-cooldown 21d,
--    recency, pillar-gewicht, prestatie-bonus, dedup per zoekwoord).
create or replace function public.content_select_autoblog_topics(p_limit integer default 1)
returns setof content_topics
language sql
stable security definer
set search_path to 'public'
as $$
  with cfg as (
    select coalesce(
      (select (settings->>'brand_fit_threshold')::numeric from public.content_engine_settings where is_active limit 1),
      0.4
    ) as fit_threshold
  ),
  covered as (
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
      end
      -- Branche-weging: on-brand onderwerpen winnen van randgevallen met een hogere
      -- SEO-kans. NULL (nog niet gescoord) telt als neutraal 0.7.
      * coalesce(t.brand_fit, 0.7)
      * (
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
    cross join cfg
    left join public.content_keywords k on k.id = t.matched_keyword_id
    left join cluster_state cs on cs.cluster = k.cluster
    left join cluster_perf cp on cp.cluster = k.cluster
    left join recent_pub rp on rp.cluster = k.cluster
    where t.status in ('idea','approved_for_draft')
      and t.blog_post_id is null
      -- Branche-poort: onder de drempel nooit kiezen (normaliter al 'rejected' door de
      -- scoring in content-discovery; dit vangt races en handmatig teruggezette topics af).
      and (t.brand_fit is null or t.brand_fit >= cfg.fit_threshold)
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
