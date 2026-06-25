-- Past door Claude voorgestelde pijler/cluster-groepen toe op content_keywords (cluster + is_pillar). service_role.
create or replace function public.content_apply_clusters(p_clusters jsonb) returns int
language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid := '00000000-0000-0000-0000-000000000001'; v_count int := 0;
begin
  with cl as (
    select c->>'cluster' as cluster,
           lower(btrim(c->>'pillar_query')) as pillar,
           (select array_agg(lower(btrim(m))) from jsonb_array_elements_text(coalesce(c->'members','[]'::jsonb)) m) as members
    from jsonb_array_elements(p_clusters) c
    where coalesce(c->>'cluster','') <> ''
  ),
  assign as (
    select distinct on (q) cluster, q, is_pillar from (
      select cluster, pillar as q, true as is_pillar from cl where pillar <> ''
      union all
      select cluster, unnest(members) as q, false as is_pillar from cl
    ) s
    where q is not null and q <> ''
    order by q, is_pillar desc
  )
  update public.content_keywords k
    set cluster = a.cluster, is_pillar = a.is_pillar
  from assign a
  where k.organization_id = v_org and lower(k.query) = a.q;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.content_apply_clusters(jsonb) from public, anon, authenticated;
grant execute on function public.content_apply_clusters(jsonb) to service_role;
