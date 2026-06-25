-- Contentflow-herontwerp: stap-1 pool vs stap-2 agenda via agenda_at + een research-collector die door Claude
-- (web-search) gevonden VRAGEN wegschrijft als onderwerpen onder stap 1.

-- Pool (stap 1) = status idea + agenda_at null; Agenda (stap 2) = status idea + agenda_at gezet.
alter table public.content_topics add column if not exists agenda_at timestamptz;
create index if not exists content_topics_agenda_idx on public.content_topics(status, agenda_at);

-- Schrijft een door Claude-research gevonden vraag weg als onderwerp (dedup op slug van de vraag). service_role.
create or replace function public.content_ingest_research(
  p_question text,
  p_toelichting text default null,
  p_target_keyword text default null,
  p_source_url text default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_key text;
  v_id uuid;
begin
  if coalesce(btrim(p_question), '') = '' then return null; end if;
  v_key := trim(both '-' from regexp_replace(lower(p_question), '[^a-z0-9]+', '-', 'g'));
  if v_key = '' then return null; end if;

  select id into v_id from public.content_topics where organization_id = v_org and novelty_key = v_key limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.content_topics (organization_id, source_type, source_url, raw_title, raw_summary,
    novelty_key, conversation_question, background, target_keyword, brief_generated_at, generated_by, status)
  values (v_org, 'web_research', p_source_url, p_question, p_toelichting,
    v_key, p_question, p_toelichting, p_target_keyword, now(), 'agent:claude-research@v1', 'idea')
  on conflict (organization_id, novelty_key) do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.content_ingest_research(text, text, text, text) from public, anon, authenticated;
grant execute on function public.content_ingest_research(text, text, text, text) to service_role;
