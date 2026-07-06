-- Aparte "schone" hero-foto (zonder ingebakken tekst) voor de artikel-hero op de kennisbank-site.
-- De bestaande cover_image_* blijft de composiet (foto + kop) voor og:image/thumbnail; de hero gebruikt
-- deze rauwe foto met de echte <h1> eroverheen (beter voor mobiel + SEO). Gevuld door de cover-pijplijn.
alter table public.blog_posts add column if not exists hero_image_url text;
alter table public.blog_posts add column if not exists hero_image_alt text;
