-- Revisie-flow: "klant wil wijzigingen op een verstuurde offerte" → nieuwe versie als
-- concept-kopie (nieuw documentnummer in dezelfde object-reeks), de oude offerte wordt bij
-- het VERZENDEN van de nieuwe versie 'vervangen' (géén 'verloren' — de deal loopt door op
-- dezelfde lead) en zijn ondertekenlink wordt ingetrokken (quote_acceptances → 'revoked',
-- de klant-copy daarvoor bestond al in quote-accept).
--
-- 'vervangen' toegevoegd aan de status-set; ketting in twee richtingen:
--   revision_of_quote_id   (op de nieuwe versie → de bron)
--   superseded_by_quote_id (op de oude versie → de vervanger; gezet door quote-send)

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('concept','intern_ter_ondertekening','verstuurd','getekend','verlopen','afgewezen','vervangen'));

alter table public.quotes
  add column if not exists revision_of_quote_id uuid references public.quotes(id) on delete set null;
alter table public.quotes
  add column if not exists superseded_by_quote_id uuid references public.quotes(id) on delete set null;

comment on column public.quotes.revision_of_quote_id is
  'Deze offerte is een nieuwe versie (revisie) van de genoemde offerte.';
comment on column public.quotes.superseded_by_quote_id is
  'Deze offerte is vervangen door de genoemde nieuwere versie (gezet bij verzenden daarvan).';

create index if not exists quotes_revision_of_idx
  on public.quotes(revision_of_quote_id) where revision_of_quote_id is not null;
create index if not exists quotes_superseded_by_idx
  on public.quotes(superseded_by_quote_id) where superseded_by_quote_id is not null;
