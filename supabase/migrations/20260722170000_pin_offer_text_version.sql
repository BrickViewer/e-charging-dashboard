-- Verstuurde/getekende offertes vastpinnen op hun HUIDIGE tekstversie.
--
-- offerTemplate.ts leest `offer_details.text_version` met terugval op de default. Zolang een
-- verzonden offerte die sleutel mist, verschuift zijn tekst mee met elke default-bump — dan is
-- het document dat de klant heeft niet meer te reproduceren. Dat is precies het probleem dat we
-- oplossen (het scherm toonde bij offerte 211-01-26 iets anders dan de verzonden PDF).
--
-- De huidige default is 2, dus alles zonder text_version dat NIET meer concept is, wordt hier op
-- 2 gepind vóórdat de default naar 3 gaat. Concepten blijven ongepind: die mogen meebewegen tot
-- ze verstuurd worden (vanaf nu pint quote-send ze bij het versturen).
update public.quotes
set offer_details = coalesce(offer_details, '{}'::jsonb) || jsonb_build_object('text_version', 2)
where status is distinct from 'concept'
  and coalesce(offer_details->>'text_version', '') = '';
