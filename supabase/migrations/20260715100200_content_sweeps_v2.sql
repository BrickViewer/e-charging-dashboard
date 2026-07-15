-- Sweep-crons van de blogmachine v2 + vastleggen in version control (de jobs waren tot nu
-- alleen in de database aangemaakt). Wijzigingen t.o.v. v1:
--   * content-revise-sweep: een gestrand concept waarvan de auditor-scores AL boven de lat
--     liggen gaat direct naar de feitencontrole i.p.v. nóg een dure full rewrite (op 15 juli
--     kreeg een 90/92/91-blog van de oude sweep opnieuw een rewrite aangeboden).
--   * iteration = huidige revise_count (zelfde iteratie, geen burn) i.p.v. +1: transiente
--     fouten mogen geen inhoudelijke ronde kosten; content-revise bewaakt de cap zelf.
--   * factcheck_round = laatste ronde + 1 uit het rapport.
--   * Bewust GEEN slot_retry: een her-kick van een gestrand concept mag geen extra blogs
--     buiten het ma/wo/vr-schema genereren.
-- Het gat voor review_state='changes_requested' bij revise_count>=4 blijft bewust bestaan
-- (menselijke review); sinds de archiveer-hygiëne (20260715100000) zijn zulke posts bovendien
-- 'gearchiveerd' en vallen ze sowieso buiten het status='concept'-filter.
--
-- Ter documentatie: overige content-crons die alleen in de DB bestaan (ongewijzigd):
--   job  5 content-autoblog-mwf      0 6 * * 1,3,5  → invoke content-autoblog
--   job  6 content-keywords-weekly   0 5 * * 0      → invoke content-keyword-research
--   job  8 content-discovery-daily   30 5 * * *     → invoke content-discovery {force:true}
--   job  9 content-research-weekly   45 5 * * 0     → invoke content-research {force:true}
--   job 10 blog-gsc-daily            0 4 * * *      → invoke blog-search-console {days:30}
--   job 12 blog-cover-backfill       */30 * * * *   → covers voor posts zonder omslag
--   job 14 content-autoblog-retry    40 6 * * 1,3,5 → herkansing als er 45 min geen blog is
--   job 16 content-autoblog-retry2   20 7 * * 1,3,5 → tweede herkansing (85 min-guard)
--   job 17/18 blog-index-weekly / blog-indexnow-weekly

select cron.unschedule(jobid) from cron.job where jobname in ('content-revise-sweep', 'content-factcheck-sweep');

select cron.schedule('content-revise-sweep', '15 */3 * * *', $$
  with cfg as (
    select coalesce((settings->>'autoblog_target_quality')::int, 82) as tq,
           coalesce((settings->>'autoblog_target_seo_aeo')::int, 80) as tsa
    from public.content_engine_settings where is_active limit 1
  ),
  gestrand as (
    select bp.id, bp.revise_count, bp.quality_score, bp.seo_score, bp.aeo_score, bp.factcheck
    from public.blog_posts bp
    where bp.status = 'concept'
      and bp.generated_by like 'agent:%'
      and coalesce(bp.revise_count, 0) < 4
      and bp.updated_at < now() - interval '1 hour'
    order by bp.updated_at asc
    limit 3
  )
  select public.invoke_edge_function(
    case when g.quality_score >= c.tq and g.seo_score >= c.tsa and g.aeo_score >= c.tsa
         then 'content-factcheck' else 'content-revise' end,
    case when g.quality_score >= c.tq and g.seo_score >= c.tsa and g.aeo_score >= c.tsa
         then jsonb_build_object(
                'blog_post_id', g.id,
                'iteration', greatest(coalesce(g.revise_count, 1), 1),
                'factcheck_round', coalesce((g.factcheck->>'round')::int, 0) + 1)
         else jsonb_build_object(
                'blog_post_id', g.id,
                'iteration', greatest(coalesce(g.revise_count, 1), 1))
    end
  )
  from gestrand g cross join cfg c
$$);

select cron.schedule('content-factcheck-sweep', '25 */3 * * *', $$
  select public.invoke_edge_function(
    'content-factcheck',
    jsonb_build_object(
      'blog_post_id', bp.id,
      'iteration', greatest(coalesce(bp.revise_count, 1), 1),
      'factcheck_round', coalesce((bp.factcheck->>'round')::int, 0) + 1)
  )
  from public.blog_posts bp
  where bp.status = 'concept'
    and bp.generated_by like 'agent:%'
    and coalesce(bp.revise_count, 0) >= 4
    and bp.review_state is distinct from 'changes_requested'
    and bp.updated_at < now() - interval '6 hours'
$$);
