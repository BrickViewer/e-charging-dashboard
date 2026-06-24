-- Fase 3: draft-ingest (skill-gedreven generatie schrijft hier weg, mét server-side gate) +
-- publish->distributies-enqueue-trigger (kanaal-agnostisch, inert tot kanalen aan staan).

-- content_ingest_draft: zet een door de AI gegenereerd concept als blog_post (status='concept'),
-- koppelt het aan het onderwerp, en bepaalt review_state via de kwaliteitsdrempels. NOOIT gepubliceerd.
create or replace function public.content_ingest_draft(
  p_topic_id uuid,
  p_title text,
  p_content text,
  p_excerpt text default null,
  p_slug text default null,
  p_category text default null,
  p_tags text[] default '{}',
  p_faq jsonb default '[]'::jsonb,
  p_seo_title text default null,
  p_seo_description text default null,
  p_canonical_url text default null,
  p_cover_image_url text default null,
  p_author_name text default null,
  p_seo_score int default null,
  p_aeo_score int default null,
  p_quality_score int default null,
  p_meta_variants jsonb default '{}'::jsonb,
  p_internal_link_suggestions jsonb default '[]'::jsonb,
  p_generated_by text default 'agent:seo-aeo-chain@v1'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := '00000000-0000-0000-0000-000000000001';
  v_settings jsonb;
  v_min_q int; v_min_seo int; v_min_aeo int;
  v_base text; v_slug text; v_n int := 1;
  v_words int; v_reading int;
  v_review text;
  v_cat_slug text;
  v_post_id uuid;
begin
  if coalesce(btrim(p_title),'') = '' or coalesce(btrim(p_content),'') = '' then
    raise exception 'Titel en inhoud zijn verplicht';
  end if;
  if p_topic_id is not null then
    select organization_id into v_org from public.content_topics where id = p_topic_id;
    if v_org is null then v_org := '00000000-0000-0000-0000-000000000001'; end if;
  end if;

  select settings into v_settings from public.content_engine_settings where is_active limit 1;
  v_min_q   := coalesce((v_settings->>'min_quality')::int, 75);
  v_min_seo := coalesce((v_settings->>'min_seo')::int, 70);
  v_min_aeo := coalesce((v_settings->>'min_aeo')::int, 65);

  -- Gate: onder een drempel → markeer als 'changes_requested' (mens ziet waarom), anders 'needs_review'.
  if (p_quality_score is not null and p_quality_score < v_min_q)
     or (p_seo_score is not null and p_seo_score < v_min_seo)
     or (p_aeo_score is not null and p_aeo_score < v_min_aeo) then
    v_review := 'changes_requested';
  else
    v_review := 'needs_review';
  end if;

  -- Unieke slug binnen de organisatie.
  v_base := trim(both '-' from regexp_replace(lower(coalesce(nullif(btrim(p_slug),''), p_title)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'blog'; end if;
  v_slug := v_base;
  while exists (select 1 from public.blog_posts where organization_id = v_org and slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  v_words := array_length(regexp_split_to_array(btrim(regexp_replace(p_content, '<[^>]+>', ' ', 'g')), '\s+'), 1);
  v_reading := greatest(1, round(coalesce(v_words, 0) / 200.0));
  v_cat_slug := case when p_category is not null then trim(both '-' from regexp_replace(lower(p_category), '[^a-z0-9]+', '-', 'g')) else null end;

  insert into public.blog_posts (
    organization_id, slug, title, excerpt, content, category, category_slug, tags, faq,
    seo_title, seo_description, canonical_url, cover_image_url, author_name, reading_minutes,
    status, review_state, generated_by, source_topic_id, seo_score, aeo_score,
    meta_variants, internal_link_suggestions
  ) values (
    v_org, v_slug, btrim(p_title), p_excerpt, p_content, p_category, v_cat_slug, coalesce(p_tags,'{}'), coalesce(p_faq,'[]'::jsonb),
    p_seo_title, p_seo_description, p_canonical_url, p_cover_image_url, p_author_name, v_reading,
    'concept', v_review, p_generated_by, p_topic_id, p_seo_score, p_aeo_score,
    coalesce(p_meta_variants,'{}'::jsonb), coalesce(p_internal_link_suggestions,'[]'::jsonb)
  ) returning id into v_post_id;

  if p_topic_id is not null then
    update public.content_topics
      set blog_post_id = v_post_id, status = 'drafted',
          seo_score = p_seo_score, aeo_score = p_aeo_score, quality_score = p_quality_score
      where id = p_topic_id;
  end if;

  return jsonb_build_object('blog_post_id', v_post_id, 'slug', v_slug, 'review_state', v_review);
end $$;

revoke all on function public.content_ingest_draft(uuid,text,text,text,text,text,text[],jsonb,text,text,text,text,text,int,int,int,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.content_ingest_draft(uuid,text,text,text,text,text,text[],jsonb,text,text,text,text,text,int,int,int,jsonb,jsonb,text) to service_role;

-- Publish -> distributies-enqueue: bij overgang naar 'gepubliceerd' één pending-rij per ingeschakeld
-- kanaal. Inert tot kanalen aangezet worden. Geen dubbele rijen (guard via not exists).
create or replace function public.tg_blog_enqueue_distributions()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare v_ch jsonb;
begin
  if new.status = 'gepubliceerd' and (tg_op = 'INSERT' or old.status is distinct from 'gepubliceerd') then
    select coalesce(settings->'channels','{}'::jsonb) into v_ch from public.content_engine_settings where is_active limit 1;
    if coalesce((v_ch->>'newsletter')::boolean, false)
       and not exists (select 1 from public.content_distributions where content_ref_id = new.id and channel = 'newsletter' and status in ('pending','queued','scheduled','sent')) then
      insert into public.content_distributions (organization_id, content_ref_type, content_ref_id, channel, status)
        values (new.organization_id, 'blog_post', new.id, 'newsletter', 'pending');
    end if;
    if coalesce((v_ch->>'linkedin')::boolean, false)
       and not exists (select 1 from public.content_distributions where content_ref_id = new.id and channel = 'linkedin' and status in ('pending','queued','scheduled','sent')) then
      insert into public.content_distributions (organization_id, content_ref_type, content_ref_id, channel, status)
        values (new.organization_id, 'blog_post', new.id, 'linkedin', 'pending');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists blog_enqueue_distributions on public.blog_posts;
create trigger blog_enqueue_distributions after insert or update on public.blog_posts
  for each row execute function public.tg_blog_enqueue_distributions();
