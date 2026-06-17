-- Atomic-claim kolom om dubbele handoffs naar de E-Portal te voorkomen.
-- order-handoff claimt de order (zet handoff_started_at) met een conditionele update
-- VOOR het POSTen; gelijktijdige aanroepen die de claim niet winnen, sturen niet.
alter table public.installation_orders
  add column if not exists handoff_started_at timestamptz;
