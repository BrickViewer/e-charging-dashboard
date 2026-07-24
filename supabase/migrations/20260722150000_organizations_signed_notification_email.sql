-- Ontvanger van de interne "offerte/contract ondertekend"-melding. Stond hardgecodeerd op
-- info@e-charging.nl in quote-accept, terwijl vergelijkbare meldingen (handoff, storingen,
-- leads) al wél een instelbaar adres hebben. Nu consistent.
alter table public.organizations
  add column if not exists signed_notification_email text not null default 'info@e-charging.nl';

comment on column public.organizations.signed_notification_email is
  'Interne ontvanger van de melding dat een offerte/contract is ondertekend (quote-accept).';
