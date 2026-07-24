-- WeFact-facturatiekoppeling — volledig schema (version-controlled baseline).
-- De kolommen/tabellen zijn eerder via de Supabase-MCP op productie toegepast; dit
-- bestand reconstrueert ze idempotent zodat de repo klopt met de database.

-- ── Debiteur-anker op de identiteitslaag (companies + persons) ────────────────
alter table public.companies
  add column if not exists wefact_debtor_id text,
  add column if not exists wefact_debtor_code text;
alter table public.persons
  add column if not exists wefact_debtor_id text,
  add column if not exists wefact_debtor_code text;
create unique index if not exists companies_wefact_debtor_code_uidx on public.companies (wefact_debtor_code) where wefact_debtor_code is not null;
create unique index if not exists persons_wefact_debtor_code_uidx on public.persons (wefact_debtor_code) where wefact_debtor_code is not null;

-- ── Crediteur-anker op clients (self-billing) ─────────────────────────────────
alter table public.clients
  add column if not exists wefact_creditor_id text,
  add column if not exists wefact_creditor_code text;
create unique index if not exists clients_wefact_creditor_code_uidx on public.clients (wefact_creditor_code) where wefact_creditor_code is not null;

-- ── Org-config (secret zelf = edge-env/Vault) ─────────────────────────────────
alter table public.organizations
  add column if not exists wefact_enabled boolean not null default false,
  add column if not exists wefact_tax_code_sale text,
  add column if not exists wefact_tax_code_purchase text,
  add column if not exists wefact_debtor_group_id text,
  add column if not exists wefact_product_code_activation text;

-- ── Refs op installatie-order (verkoop) + settlement (self-billing/inkoop) ────
alter table public.installation_orders
  add column if not exists wefact_invoice_id text,
  add column if not exists wefact_invoice_code text;
alter table public.settlements
  add column if not exists wefact_creditinvoice_id text,
  add column if not exists wefact_creditinvoice_code text,
  add column if not exists wefact_synced_at timestamptz,
  add column if not exists wefact_sync_error text,
  add column if not exists wefact_status text,
  add column if not exists wefact_amount_paid numeric,
  add column if not exists wefact_paid_at timestamptz;
create unique index if not exists settlements_wefact_creditinvoice_id_uidx on public.settlements (wefact_creditinvoice_id) where wefact_creditinvoice_id is not null;

-- ── Spiegel van WeFact-VERKOOPfacturen (model = eflux_invoices) ───────────────
create table if not exists public.wefact_invoices (
  id uuid primary key default gen_random_uuid(),
  wefact_invoice_id text not null,
  invoice_code text,
  debtor_code text,
  debtor_name text,
  kind text not null default 'onbekend' check (kind in ('installatie','activatie','handmatig','onbekend')),
  client_id uuid references public.clients(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  person_id uuid references public.persons(id) on delete set null,
  installation_order_id uuid references public.installation_orders(id) on delete set null,
  status text,
  status_code integer,
  currency text default 'EUR',
  amount_excl numeric,
  amount_incl numeric,
  amount_paid numeric,
  amount_outstanding numeric,
  invoice_date date,
  pay_before date,
  pay_date date,
  payment_url text,
  sent integer default 0,
  raw_data jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wefact_invoices_wefact_invoice_id_uidx on public.wefact_invoices (wefact_invoice_id);
create index if not exists wefact_invoices_client_idx on public.wefact_invoices (client_id);
create index if not exists wefact_invoices_company_idx on public.wefact_invoices (company_id);
create index if not exists wefact_invoices_person_idx on public.wefact_invoices (person_id);
create index if not exists wefact_invoices_order_idx on public.wefact_invoices (installation_order_id);
alter table public.wefact_invoices enable row level security;
drop policy if exists "Internal users can view wefact invoices" on public.wefact_invoices;
create policy "Internal users can view wefact invoices" on public.wefact_invoices for select to authenticated
  using ((select app_private.is_internal(auth.uid())));

-- ── Watermark/observability voor de sync ──────────────────────────────────────
create table if not exists public.wefact_sync_state (
  entity_type text primary key,
  last_synced_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.wefact_sync_state enable row level security;
drop policy if exists "Internal users can view wefact sync state" on public.wefact_sync_state;
create policy "Internal users can view wefact sync state" on public.wefact_sync_state for select to authenticated
  using ((select app_private.is_internal(auth.uid())));

-- ── Maand-omzet/kosten/netto (admin-only) ─────────────────────────────────────
create or replace function public.wefact_monthly_overview(p_year integer default null)
returns table (
  year integer, month integer,
  invoiced_incl numeric, invoiced_excl numeric, paid_incl numeric, outstanding_incl numeric,
  installatie_excl numeric, activatie_excl numeric, handmatig_excl numeric,
  cost_payout numeric, cost_paid numeric, net_excl numeric
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_year integer := coalesce(p_year, extract(year from (now() at time zone 'Europe/Amsterdam'))::int);
begin
  if not app_private.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Alleen admin mag het facturatie-overzicht opvragen' using errcode = '42501';
  end if;
  return query
  with months as (select generate_series(1, 12) as m),
  sales as (
    select extract(month from coalesce(wi.invoice_date, (wi.created_at at time zone 'Europe/Amsterdam')::date))::int as m,
      wi.kind, coalesce(wi.amount_incl,0) as incl, coalesce(wi.amount_excl,0) as excl,
      coalesce(wi.amount_paid,0) as paid, coalesce(wi.amount_outstanding,0) as outstanding
    from public.wefact_invoices wi
    where coalesce(wi.status,'') <> 'concept'
      and extract(year from coalesce(wi.invoice_date, (wi.created_at at time zone 'Europe/Amsterdam')::date)) = v_year
  ),
  sales_agg as (
    select m, sum(incl) as invoiced_incl, sum(excl) as invoiced_excl, sum(paid) as paid_incl, sum(outstanding) as outstanding_incl,
      sum(excl) filter (where kind='installatie') as installatie_excl,
      sum(excl) filter (where kind='activatie') as activatie_excl,
      sum(excl) filter (where kind='handmatig') as handmatig_excl
    from sales group by m
  ),
  costs as (
    select s.month as m, sum(coalesce(s.client_payout,0)) as cost_payout,
      sum(case when s.wefact_status='betaald' or s.wefact_paid_at is not null then coalesce(s.client_payout,0) else 0 end) as cost_paid
    from public.settlements s
    where s.wefact_creditinvoice_id is not null and s.year = v_year
    group by s.month
  )
  select v_year, mo.m,
    coalesce(sa.invoiced_incl,0), coalesce(sa.invoiced_excl,0), coalesce(sa.paid_incl,0), coalesce(sa.outstanding_incl,0),
    coalesce(sa.installatie_excl,0), coalesce(sa.activatie_excl,0), coalesce(sa.handmatig_excl,0),
    coalesce(c.cost_payout,0), coalesce(c.cost_paid,0), coalesce(sa.invoiced_excl,0) - coalesce(c.cost_payout,0)
  from months mo left join sales_agg sa on sa.m = mo.m left join costs c on c.m = mo.m
  order by mo.m;
end $$;
revoke all on function public.wefact_monthly_overview(integer) from public;
grant execute on function public.wefact_monthly_overview(integer) to authenticated;

-- ── Dagelijkse syncs (idempotente cron-upserts) ───────────────────────────────
select cron.schedule('wefact-status-sync-daily', '0 4 * * *', $$ select public.invoke_edge_function('wefact-status-sync', '{}'::jsonb); $$);
select cron.schedule('wefact-settlement-sync-daily', '15 4 * * *', $$ select public.invoke_edge_function('wefact-settlement-sync', '{}'::jsonb); $$);
