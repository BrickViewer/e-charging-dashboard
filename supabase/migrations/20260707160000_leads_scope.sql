-- Lead-scope: leg bij een nieuwe lead vast of het om installatie, beheer of beide gaat,
-- zodat de scope + het aantal palen (estimated_charge_points bestaat al) meteen op de
-- lead-kaart zichtbaar zijn — nog vóór er een offerte is. Waarden spiegelen QuoteScope.
alter table public.leads add column if not exists scope text;

alter table public.leads drop constraint if exists leads_scope_check;
alter table public.leads add constraint leads_scope_check
  check (scope is null or scope in ('installatie_beheer', 'alleen_installatie', 'alleen_beheer'));
