-- DocuSign-stijl interne ondertekening voor offertes.
-- Per-admin opgeslagen handtekening + interne-ondertekenaar snapshot op de quote
-- + token-tabel voor de interne tekenlink (spiegel van quote_acceptances).

-- per-admin opgeslagen handtekening (één keer ingesteld in instellingen)
alter table public.profiles add column if not exists signature_data_url text;
alter table public.profiles add column if not exists signer_title text;

-- interne-ondertekenaar snapshot op de quote
alter table public.quotes add column if not exists internal_signer_user_id uuid references auth.users(id) on delete set null;
alter table public.quotes add column if not exists internal_signer_name text;
alter table public.quotes add column if not exists internal_signer_function text;
alter table public.quotes add column if not exists internal_signed_at timestamptz;
alter table public.quotes add column if not exists internal_signature_data_url text;

-- statuscheck uitbreiden (named constraint quotes_status_check, bestaand patroon)
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('concept','intern_ter_ondertekening','verstuurd','getekend','verlopen','afgewezen'));

-- token-tabel voor de interne tekenlink (spiegel van quote_acceptances)
create table if not exists public.quote_internal_signings (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signer_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  token_last4 text,
  status text not null default 'pending' check (status in ('pending','signed','edited','revoked')),
  expires_at timestamptz not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quote_internal_signings_quote_idx on public.quote_internal_signings(quote_id);
create unique index if not exists quote_internal_signings_one_pending
  on public.quote_internal_signings(quote_id) where status = 'pending';
alter table public.quote_internal_signings enable row level security;
drop policy if exists "Internal can view internal signings" on public.quote_internal_signings;
create policy "Internal can view internal signings" on public.quote_internal_signings
  for select to authenticated using (app_private.is_internal(auth.uid()));
drop policy if exists "Sales can manage internal signings" on public.quote_internal_signings;
create policy "Sales can manage internal signings" on public.quote_internal_signings
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));
