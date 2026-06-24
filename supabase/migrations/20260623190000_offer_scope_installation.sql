-- Offerte-scope: trek "installatie" los van "beheer". with_management blijft de beheer-as
-- (→ clients.managed, settlement-gate); deze migratie voegt de installatie-as toe.
-- Default true → bestaande quotes/clients (die allemaal installatie hadden) blijven ongewijzigd.
alter table public.quotes   add column if not exists with_installation boolean not null default true;
alter table public.clients  add column if not exists needs_installation boolean not null default true;
