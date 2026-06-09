-- Offerte-module: quotes uitbreiden + acceptatie-token-tabel + offertenummer-sequence.

alter table public.quotes add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table public.quotes add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.quotes add column if not exists sent_at timestamptz;

create sequence if not exists public.quotes_offer_seq;

create index if not exists quotes_lead_idx on public.quotes(lead_id);

-- Acceptatie via beveiligde token-link (patroon van client_invitations).
create table if not exists public.quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  token_last4 text,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quote_acceptances_quote_idx on public.quote_acceptances(quote_id);
create unique index if not exists quote_acceptances_one_pending_per_quote
  on public.quote_acceptances(quote_id) where status = 'pending';

alter table public.quote_acceptances enable row level security;
drop policy if exists "Internal users can view quote_acceptances" on public.quote_acceptances;
create policy "Internal users can view quote_acceptances" on public.quote_acceptances
  for select to authenticated using (app_private.is_internal(auth.uid()));
drop policy if exists "Sales team can manage quote_acceptances" on public.quote_acceptances;
create policy "Sales team can manage quote_acceptances" on public.quote_acceptances
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));
