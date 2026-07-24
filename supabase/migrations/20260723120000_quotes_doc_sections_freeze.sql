-- Documentopbouw van een offerte bevriezen zodra die de deur uit is.
--
-- offer_details.docSections bepaalt welke offerte-onderdelen BUITEN het klantdocument vallen
-- (zie OFFER_SECTIONS in apps/admin/src/services/offerTemplate.ts). De offerte wordt bij elke
-- weergave live opnieuw gerenderd — de publieke accept-pagina, de PDF-bijlage en de getekende
-- PDF komen alle drie uit hetzelfde sjabloon. Wijzigt de documentopbouw ná verzending, dan
-- rendert een al getekend document ineens anders dan wat de klant heeft ontvangen en getekend,
-- en klopt de hash in quote_signature_evidence niet meer met het feitelijke stuk.
--
-- Bewust GEEN algemene offer_details-freeze: andere sleutels (leveringText, stelpostGraafwerk,
-- e-mailvelden) worden legitiem ook na verzending nog geschreven. Alleen de documentopbouw
-- wordt bewaakt.

create or replace function app_private.enforce_quote_doc_sections_freeze()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 'intern_ter_ondertekening' MOET in de toegestane lijst staan: quote-request-signoff zet die
  -- status vóórdat quote-send (via chainToCustomerSend) zijn gecombineerde update doet, waarin
  -- offer_details en status in één keer worden weggeschreven.
  if old.status is distinct from 'concept'
     and old.status is distinct from 'intern_ter_ondertekening'
     and (new.offer_details -> 'docSections') is distinct from (old.offer_details -> 'docSections')
  then
    raise exception 'De documentopbouw van offerte % kan na verzending niet meer wijzigen', coalesce(old.quote_number, '?')
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- zz_-prefix: BEFORE-triggers vuren in alfabetische volgorde, dus deze guard beoordeelt de
-- definitieve NEW nadat andere before-triggers hun aanpassingen hebben gedaan.
drop trigger if exists zz_quotes_doc_sections_freeze on public.quotes;
create trigger zz_quotes_doc_sections_freeze
before update on public.quotes
for each row
execute function app_private.enforce_quote_doc_sections_freeze();

comment on function app_private.enforce_quote_doc_sections_freeze() is
  'Blokkeert wijzigingen aan offer_details.docSections zodra een offerte verstuurd/getekend is, zodat her-renderen exact het document oplevert dat de klant heeft ontvangen.';
