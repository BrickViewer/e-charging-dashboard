-- Extra SEO-velden voor de blog/kennisbank-output.
alter table public.blog_posts add column if not exists category_slug text;
alter table public.blog_posts add column if not exists cover_image_alt text;
alter table public.blog_posts add column if not exists cover_image_width int;
alter table public.blog_posts add column if not exists cover_image_height int;
alter table public.blog_posts add column if not exists noindex boolean not null default false;
alter table public.blog_posts add column if not exists canonical_url text;
alter table public.blog_posts add column if not exists faq jsonb not null default '[]'::jsonb;
