-- WeFact-statussync van dagelijks 04:00 naar elk uur.
--
-- Aanleiding: onze spiegel `wefact_invoices` werkt alleen bij via een actie in onze eigen app
-- of via deze cron. Verstuur je een factuur IN WeFact zelf, dan liep het dashboard tot 24 uur
-- achter (Albert Vos, 24-07-2026: concept om 08:55 aangemaakt, sync had om 04:00 gedraaid --
-- zijn kaart bleef in 'Factureren' staan terwijl de factuur al verstuurd was, omdat
-- app_private.recalc_activation_invoiced() pas meetelt bij sent > 0).
--
-- Kosten: 1x invoice.list + 1x creditinvoice.list per uur. WeFact staat 200/min en 3.600/uur
-- per IP toe (overschrijden = 403-firewallblock, geen 429), dus dit is verwaarloosbaar.
-- Het factuurscherm doet daarnaast een gerichte per-factuur refresh bij openen
-- (wefact-invoice-actions action 'refresh'); deze cron dekt wat volledig buiten de app om gaat.

select cron.unschedule('wefact-status-sync-daily');

select cron.schedule(
  'wefact-status-sync-hourly',
  '0 * * * *',
  $$ select public.invoke_edge_function('wefact-status-sync', '{}'::jsonb); $$
);
