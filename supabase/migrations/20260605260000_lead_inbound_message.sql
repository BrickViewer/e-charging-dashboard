-- Inkomend bericht van de aanvrager (bv. via contactformulier), los van interne notities.
alter table public.leads add column if not exists message_subject text;
alter table public.leads add column if not exists message_body text;
