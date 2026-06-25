-- Laag A van de SEO-blogmotor: zoekvraag-onderzoek. content_keywords bewaart wat de doelgroep googelt
-- (long-tail uit Google Autocomplete + handmatig), met intent + prioriteit. content_ingest_keyword dedupt
-- en berekent prioriteit. keyword_seeds gaan in content_engine_settings (niet-destructief geseed).

create table if not exists public.content_keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'
    references public.organizations(id) on delete cascade,
  query text not null,
  normalized_key text not null,
  seed text,
  cluster text,
  intent text not null default 'informational'
    check (intent in ('informational','commercial','transactional','navigational')),
  audience text,
  source text not null default 'autocomplete'
    check (source in ('autocomplete','manual')),
  priority numeric not null default 0,
  times_seen int not null default 1,
  status text not null default 'active' check (status in ('active','archived')),
  last_seen_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, normalized_key)
);
create index if not exists content_keywords_priority_idx on public.content_keywords(status, priority desc);
create index if not exists content_keywords_cluster_idx on public.content_keywords(cluster);
create index if not exists content_keywords_query_trgm_idx on public.content_keywords using gin (query gin_trgm_ops);

drop trigger if exists content_keywords_set_updated_at on public.content_keywords;
create trigger content_keywords_set_updated_at before update on public.content_keywords
  for each row execute function public.tg_contacts_set_updated_at();

alter table public.content_keywords enable row level security;
create policy "Marketing manage content_keywords" on public.content_keywords for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'));
grant select, insert, update, delete on public.content_keywords to authenticated;
grant all on public.content_keywords to service_role;
revoke all on public.content_keywords from anon;

-- Dedup + upsert + deterministische prioriteit (geen LLM). service_role-only.
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

-- Zaad-termen voor het onderzoek (B2B laadinfra). Niet-destructief: alleen zetten als er nog geen seeds staan.
update public.content_engine_settings
set settings = settings || jsonb_build_object('keyword_seeds', '[
  {"term":"laadpaal vve","cluster":"vve","audience":"vve"},
  {"term":"laadplein appartementencomplex","cluster":"vve","audience":"vve"},
  {"term":"laadpalen vastgoed","cluster":"vastgoed","audience":"vastgoed"},
  {"term":"laadpaal huurpand","cluster":"vastgoed","audience":"vastgoed"},
  {"term":"laadinfrastructuur bedrijfspand","cluster":"bedrijf","audience":"bedrijf"},
  {"term":"laadplein bedrijf","cluster":"bedrijf","audience":"bedrijf"},
  {"term":"laadpaal beheer zakelijk","cluster":"bedrijf","audience":"bedrijf"},
  {"term":"laadpaal verplicht parkeergarage","cluster":"wetgeving","audience":"vastgoed"},
  {"term":"kosten laadpaal plaatsen","cluster":"kosten","audience":"bedrijf"},
  {"term":"terugverdientijd laadpaal","cluster":"kosten","audience":"bedrijf"},
  {"term":"subsidie laadpaal zakelijk","cluster":"subsidie","audience":"bedrijf"},
  {"term":"netcongestie laden","cluster":"net","audience":"bedrijf"}
]'::jsonb)
where is_active = true
  and coalesce(jsonb_array_length(settings->'keyword_seeds'), 0) = 0;
