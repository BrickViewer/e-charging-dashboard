-- Security hardening (audit F-4): de publieke blog-media-bucket had een brede SELECT-policy
-- (anon+authenticated, alle objecten) waardoor iedereen ALLE bestandspaden kon listen
-- (advisor: public_bucket_allows_listing). De bucket is public=true, dus afbeeldingen worden
-- geserveerd via de publieke object-URL (/storage/v1/object/public/blog-media/…) — dat pad
-- omzeilt RLS en blijft werken. Uploads lopen via "Marketing manage blog-media" (admin/manager/
-- marketing). Geverifieerd: nergens in de code wordt storage.list() op blog-media gebruikt, alleen
-- getPublicUrl()/upload(). Daarom de listing-policy verwijderen → geen enumeratie meer, render intact.

drop policy if exists "Public read blog-media" on storage.objects;
