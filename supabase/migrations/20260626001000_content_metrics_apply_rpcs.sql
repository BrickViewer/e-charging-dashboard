-- Helpers voor de content-metrics + content-serp-gap edges: bulk-update vanuit DataForSEO-resultaten in 1 query,
-- met herberekende opportunity-score. service_role-only.

create or replace function public.content_apply_keyword_metrics(p_rows jsonb) returns int
language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_count int := 0;
begin
  with rows as (
    select lower(btrim(x->>'q')) as nkey,
           nullif(x->>'v','')::int as v,
           nullif(x->>'kd','')::numeric as kd,
           nullif(x->>'comp','')::numeric as comp,
           nullif(x->>'cpc','')::numeric as cpc
    from jsonb_array_elements(p_rows) x
  )
  update public.content_keywords k
    set search_volume = r.v, keyword_difficulty = r.kd, competition = r.comp, cpc = r.cpc,
        metrics_at = now(),
        opportunity = public.content_keyword_opportunity(k.priority, r.v, r.kd, k.serp_gap)
  from rows r
  where k.organization_id = v_org and lower(k.query) = r.nkey;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.content_apply_keyword_metrics(jsonb) from public, anon, authenticated;
grant execute on function public.content_apply_keyword_metrics(jsonb) to service_role;

create or replace function public.content_apply_serp_gap(p_id uuid, p_gap numeric, p_notes text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_gap numeric := greatest(0, least(1, p_gap));
begin
  update public.content_keywords k
    set serp_gap = v_gap, serp_notes = p_notes, serp_checked_at = now(),
        opportunity = public.content_keyword_opportunity(k.priority, k.search_volume, k.keyword_difficulty, v_gap)
  where k.id = p_id and k.organization_id = v_org;
end $$;
revoke all on function public.content_apply_serp_gap(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.content_apply_serp_gap(uuid, numeric, text) to service_role;
