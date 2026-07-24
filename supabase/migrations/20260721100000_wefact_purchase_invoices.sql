-- Spiegel van ALLE WeFact-inkoopfacturen (creditinvoice), zodat kosten zichtbaar zijn
-- op /admin/facturatie. Self-billing-afrekeningen krijgen is_self_billing=true
-- (die hebben hun eigen tab + settlements-betaalspiegel) zodat kosten nooit dubbel tellen.
create table if not exists public.wefact_purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  wefact_creditinvoice_id text not null,
  invoice_code text,            -- leverancierskenmerk (WeFact InvoiceCode)
  creditor_code text,
  creditor_name text,
  status text,
  status_code integer,
  amount_excl numeric,
  amount_incl numeric,
  amount_paid numeric,
  amount_outstanding numeric,
  invoice_date date,
  pay_before date,
  pay_date date,
  is_self_billing boolean not null default false,
  raw_data jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wefact_purchase_invoices_creditinvoice_id_uidx
  on public.wefact_purchase_invoices (wefact_creditinvoice_id);
create index if not exists wefact_purchase_invoices_date_idx
  on public.wefact_purchase_invoices (invoice_date);

alter table public.wefact_purchase_invoices enable row level security;
drop policy if exists "Internal users can view wefact purchase invoices" on public.wefact_purchase_invoices;
create policy "Internal users can view wefact purchase invoices" on public.wefact_purchase_invoices for select to authenticated
  using ((select app_private.is_internal(auth.uid())));

-- Maandoverzicht: kosten = self-billing-uitbetalingen (bestaand) + overige geboekte
-- WeFact-inkoopfacturen (nieuw, cost_purchase). Netto trekt beide af van de omzet.
drop function if exists public.wefact_monthly_overview(integer);
create or replace function public.wefact_monthly_overview(p_year integer default null)
returns table(
  year integer, month integer,
  invoiced_incl numeric, invoiced_excl numeric, paid_incl numeric, outstanding_incl numeric,
  installatie_excl numeric, activatie_excl numeric, handmatig_excl numeric,
  cost_payout numeric, cost_paid numeric, cost_purchase numeric, net_excl numeric
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_year integer := coalesce(p_year, extract(year from (now() at time zone 'Europe/Amsterdam'))::int);
begin
  if not app_private.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Alleen admin mag het facturatie-overzicht opvragen' using errcode = '42501';
  end if;

  return query
  with months as (select generate_series(1, 12) as m),
  sales as (
    select
      extract(month from coalesce(wi.invoice_date, (wi.created_at at time zone 'Europe/Amsterdam')::date))::int as m,
      wi.kind,
      coalesce(wi.amount_incl, 0) as incl,
      coalesce(wi.amount_excl, 0) as excl,
      coalesce(wi.amount_paid, 0) as paid,
      coalesce(wi.amount_outstanding, 0) as outstanding
    from public.wefact_invoices wi
    where coalesce(wi.status, '') <> 'concept'
      and extract(year from coalesce(wi.invoice_date, (wi.created_at at time zone 'Europe/Amsterdam')::date)) = v_year
  ),
  sales_agg as (
    select m,
      sum(incl) as invoiced_incl,
      sum(excl) as invoiced_excl,
      sum(paid) as paid_incl,
      sum(outstanding) as outstanding_incl,
      sum(excl) filter (where kind = 'installatie') as installatie_excl,
      sum(excl) filter (where kind = 'activatie') as activatie_excl,
      sum(excl) filter (where kind = 'handmatig') as handmatig_excl
    from sales group by m
  ),
  costs as (
    select s.month as m,
      sum(coalesce(s.client_payout, 0)) as cost_payout,
      sum(case when s.wefact_status = 'betaald' or s.wefact_paid_at is not null then coalesce(s.client_payout, 0) else 0 end) as cost_paid
    from public.settlements s
    where s.wefact_creditinvoice_id is not null and s.year = v_year
    group by s.month
  ),
  purchases as (
    select
      extract(month from coalesce(wp.invoice_date, (wp.created_at at time zone 'Europe/Amsterdam')::date))::int as m,
      sum(coalesce(wp.amount_excl, 0)) as cost_purchase
    from public.wefact_purchase_invoices wp
    where wp.is_self_billing = false
      and coalesce(wp.status, '') <> 'concept'
      and extract(year from coalesce(wp.invoice_date, (wp.created_at at time zone 'Europe/Amsterdam')::date)) = v_year
    group by 1
  )
  select v_year, mo.m,
    coalesce(sa.invoiced_incl, 0), coalesce(sa.invoiced_excl, 0), coalesce(sa.paid_incl, 0), coalesce(sa.outstanding_incl, 0),
    coalesce(sa.installatie_excl, 0), coalesce(sa.activatie_excl, 0), coalesce(sa.handmatig_excl, 0),
    coalesce(c.cost_payout, 0), coalesce(c.cost_paid, 0), coalesce(p.cost_purchase, 0),
    coalesce(sa.invoiced_excl, 0) - coalesce(c.cost_payout, 0) - coalesce(p.cost_purchase, 0)
  from months mo
  left join sales_agg sa on sa.m = mo.m
  left join costs c on c.m = mo.m
  left join purchases p on p.m = mo.m
  order by mo.m;
end $function$;

revoke all on function public.wefact_monthly_overview(integer) from public, anon;
grant execute on function public.wefact_monthly_overview(integer) to authenticated;
