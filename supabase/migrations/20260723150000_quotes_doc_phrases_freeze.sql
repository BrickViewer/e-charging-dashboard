-- Documentopbouw-freeze uitbreiden naar de losse zinnen (offer_details.docPhrases).
--
-- Naast docSections (hele onderdelen) kan een offerte nu ook individuele verkoopzinnen weglaten.
-- Dezelfde redenering geldt: de offerte wordt bij elke weergave live opnieuw gerenderd, dus zou de
-- opbouw ná verzending wijzigen, dan rendert een al getekend document anders dan wat de klant heeft
-- ontvangen en getekend.
--
-- De guard is nu een LUS over de bewaakte sleutels, zodat een volgende korrel (bv. losse
-- voorwaarden-bullets) alleen die array hoeft uit te breiden en geen nieuwe trigger nodig heeft.
-- De functienaam blijft ongewijzigd: hernoemen zou de bestaande trigger moeten droppen zonder dat
-- het iets oplevert.

create or replace function app_private.enforce_quote_doc_sections_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
begin
  -- 'intern_ter_ondertekening' MOET toegestaan blijven: quote-request-signoff zet die status
  -- vóórdat quote-send (via chainToCustomerSend) zijn gecombineerde update doet, waarin
  -- offer_details en status in één keer worden weggeschreven. Er mag nooit een UI-pad bijkomen
  -- dat de documentopbouw in die status schrijft.
  if old.status is distinct from 'concept'
     and old.status is distinct from 'intern_ter_ondertekening'
  then
    foreach k in array array['docSections', 'docPhrases'] loop
      if (new.offer_details -> k) is distinct from (old.offer_details -> k) then
        raise exception 'De documentopbouw van offerte % kan na verzending niet meer wijzigen (%)',
          coalesce(old.quote_number, '?'), k
          using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return new;
end
$$;

comment on function app_private.enforce_quote_doc_sections_freeze() is
  'Blokkeert wijzigingen aan de documentopbouw (offer_details.docSections en .docPhrases) zodra een offerte verstuurd/getekend is, zodat her-renderen exact het document oplevert dat de klant heeft ontvangen.';
