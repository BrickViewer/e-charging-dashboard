-- Contentmachine: betrouwbare gratis RSS-bronnen vooraf instellen, zodat het team zelf geen feeds hoeft
-- toe te voegen. Allemaal handmatig opgehaald + geverifieerd (geen API-sleutel nodig). Niet-destructief:
-- alleen invullen als er nog geen feeds staan (een bestaande lijst wordt niet overschreven).
update public.content_engine_settings
set settings = settings || jsonb_build_object('feeds', '[
  {"url":"https://elaad.nl/feed/","name":"ElaadNL"},
  {"url":"https://nklnederland.nl/feed/","name":"NKL Nederland"},
  {"url":"https://eviolin.nl/feed/","name":"eViolin"},
  {"url":"https://netbeheernederland.nl/rss.xml","name":"Netbeheer Nederland"},
  {"url":"https://solarmagazine.nl/rss.xml","name":"Solar & Storage Magazine"},
  {"url":"https://www.energystoragenl.nl/feed/","name":"Energy Storage NL"},
  {"url":"https://www.wattisduurzaam.nl/feed/","name":"WattisDuurzaam"},
  {"url":"https://www.pbl.nl/feed/topic/13/article/rss.xml","name":"PBL klimaat & energie"},
  {"url":"https://www.change.inc/feed/","name":"Change Inc"},
  {"url":"https://www.duurzaam-ondernemen.nl/nieuws/feed/","name":"Duurzaam Ondernemen"},
  {"url":"https://www.bright.nl/feed/news.xml?tag=energie","name":"Bright - energie"},
  {"url":"https://www.bright.nl/feed/news.xml?tag=elektrische-auto","name":"Bright - elektrische auto"},
  {"url":"http://www.autozine.nl/nieuws/gratis/nieuws.rss","name":"Autozine"}
]'::jsonb)
where is_active = true
  and coalesce(jsonb_array_length(settings->'feeds'), 0) = 0;
