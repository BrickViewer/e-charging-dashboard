create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id) on delete cascade,
  slug text not null,
  title text not null,
  excerpt text,
  content text,
  cover_image_url text,
  category text,
  tags text[] not null default '{}',
  featured boolean not null default false,
  seo_title text,
  seo_description text,
  author_name text,
  reading_minutes int,
  status text not null default 'concept' check (status in ('concept','gepubliceerd','gearchiveerd')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index if not exists blog_posts_status_idx on public.blog_posts(status, published_at desc);
create index if not exists blog_posts_slug_idx on public.blog_posts(slug);

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at before update on public.blog_posts
  for each row execute function public.tg_contacts_set_updated_at();

alter table public.blog_posts enable row level security;
drop policy if exists "Public can read published blog_posts" on public.blog_posts;
create policy "Public can read published blog_posts" on public.blog_posts
  for select to anon, authenticated using (status = 'gepubliceerd');
drop policy if exists "Internal can read all blog_posts" on public.blog_posts;
create policy "Internal can read all blog_posts" on public.blog_posts
  for select to authenticated using (app_private.is_internal(auth.uid()));
drop policy if exists "Marketing can manage blog_posts" on public.blog_posts;
create policy "Marketing can manage blog_posts" on public.blog_posts
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'));

insert into storage.buckets (id, name, public) values ('blog-media','blog-media', true)
  on conflict (id) do nothing;
drop policy if exists "Public read blog-media" on storage.objects;
create policy "Public read blog-media" on storage.objects
  for select to anon, authenticated using (bucket_id = 'blog-media');
drop policy if exists "Marketing manage blog-media" on storage.objects;
create policy "Marketing manage blog-media" on storage.objects
  for all to authenticated
  using (bucket_id = 'blog-media' and (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing')))
  with check (bucket_id = 'blog-media' and (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing')));
