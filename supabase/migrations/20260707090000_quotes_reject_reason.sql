-- Intern afwijzen van een verstuurde offerte mét gestructureerde reden (analyse: "waar
-- verliezen we op?" = een telling per categorie). De status 'afgewezen' zat al in de
-- CHECK-constraint maar werd nergens gezet; de edge quote-reject maakt hem functioneel.
-- Categorie-lijst is bewust een CHECK (makkelijk uitbreidbaar in een volgende migratie).

alter table public.quotes
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_reason_category text,
  add column if not exists rejected_reason text;

alter table public.quotes drop constraint if exists quotes_rejected_reason_category_check;
alter table public.quotes add constraint quotes_rejected_reason_category_check
  check (rejected_reason_category is null or rejected_reason_category in
    ('prijs', 'concurrent', 'geen_behoefte', 'timing', 'anders'));

comment on column public.quotes.rejected_reason_category is
  'Afwijsreden-categorie (prijs/concurrent/geen_behoefte/timing/anders) — voor analyse van terugkerende redenen.';
comment on column public.quotes.rejected_reason is
  'Vrije toelichting bij de afwijzing (intern).';
