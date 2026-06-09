-- Offerte met/zonder beheer + klant-vlag 'managed' (dashboard + opbrengstdeling).
alter table public.quotes add column if not exists with_management boolean not null default true;
alter table public.clients add column if not exists managed boolean not null default true;
