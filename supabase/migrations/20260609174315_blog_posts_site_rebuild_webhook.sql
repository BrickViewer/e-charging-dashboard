-- Auto-rebuild van www.e-charging.nl (Cloudflare Pages) zodra een GEPUBLICEERD
-- blogartikel wordt aangemaakt, gewijzigd of verwijderd.
--
-- Mechanisme: AFTER-trigger op public.blog_posts roept via pg_net (async,
-- non-blocking) de Cloudflare deploy hook aan. De rebuild draait de SSG-build
-- opnieuw, waardoor het nieuwe/gewijzigde artikel volledig SEO-geoptimaliseerd
-- (geprerenderde HTML, canonical, BlogPosting/FAQPage/BreadcrumbList JSON-LD) en
-- in de sitemap op de site verschijnt.
--
-- De deploy-hook-URL staat in Vault (secret: site_deploy_hook_url) en NIET in
-- deze (publieke) repo. Zonder die secret doet de trigger niets (veilige no-op),
-- dus deze migratie is veilig op elke omgeving toe te passen. Zet de secret met:
--   select vault.create_secret('<deploy hook url>', 'site_deploy_hook_url', '...');

create or replace function public.notify_site_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  hook_url text;
begin
  -- Alleen rebuilden als de wijziging de gepubliceerde set raakt
  -- (concept↔concept triggert niets → geen onnodige builds).
  if (tg_op = 'INSERT' and new.status = 'gepubliceerd')
     or (tg_op = 'UPDATE' and (new.status = 'gepubliceerd' or old.status = 'gepubliceerd'))
     or (tg_op = 'DELETE' and old.status = 'gepubliceerd') then
    select decrypted_secret into hook_url
      from vault.decrypted_secrets
      where name = 'site_deploy_hook_url'
      limit 1;
    if hook_url is not null and hook_url <> '' then
      perform net.http_post(
        url := hook_url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists blog_posts_site_rebuild on public.blog_posts;
create trigger blog_posts_site_rebuild
after insert or update or delete on public.blog_posts
for each row execute function public.notify_site_rebuild();
