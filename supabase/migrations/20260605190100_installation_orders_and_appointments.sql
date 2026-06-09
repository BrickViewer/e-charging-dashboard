-- Installatie-orders: bij offerte-akkoord ontstaat een order; later overgedragen
-- naar het externe e-groep/e-portal-systeem (werkbonnen).
create table if not exists public.installation_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'nieuw' check (status in ('nieuw','overgedragen','ingepland','geinstalleerd','afgerond','geannuleerd')),
  external_ref text,
  scheduled_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists installation_orders_client_idx on public.installation_orders(client_id);
create index if not exists installation_orders_status_idx on public.installation_orders(status);

drop trigger if exists installation_orders_set_updated_at on public.installation_orders;
create trigger installation_orders_set_updated_at before update on public.installation_orders
  for each row execute function public.tg_contacts_set_updated_at();

alter table public.installation_orders enable row level security;
drop policy if exists "Internal users can view installation_orders" on public.installation_orders;
create policy "Internal users can view installation_orders" on public.installation_orders
  for select to authenticated using (app_private.is_internal(auth.uid()));
drop policy if exists "Sales team can manage installation_orders" on public.installation_orders;
create policy "Sales team can manage installation_orders" on public.installation_orders
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));

-- Fase 3: gestructureerde afspraak op de lead.
alter table public.leads add column if not exists appointment_at timestamptz;
alter table public.leads add column if not exists appointment_notes text;
