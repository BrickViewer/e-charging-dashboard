-- ============================================================================
-- Contacten-laag: companies + persons + company_persons (veel-op-veel).
-- Bedrijf = centrale identiteit; leads/clients/quotes verwijzen ernaar.
-- Inline velden (company_name, contact_*) blijven als synchrone cache bestaan,
-- bijgewerkt door een BEFORE-trigger zodra company_id/person_id gezet is.
-- ============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  kvk text,
  btw_number text,
  website text,
  sector text,
  address_street text,
  postal_code text,
  city text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text generated always as (btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) stored,
  email text,
  phone text,
  role text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_persons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, person_id)
);

-- FK-kolommen op de bestaande tabellen (nullable, backfill in migratie B).
alter table public.leads   add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.leads   add column if not exists person_id  uuid references public.persons(id)   on delete set null;
alter table public.clients add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.clients add column if not exists person_id  uuid references public.persons(id)   on delete set null;
alter table public.quotes  add column if not exists company_id uuid references public.companies(id) on delete set null;
alter table public.quotes  add column if not exists person_id  uuid references public.persons(id)   on delete set null;

-- Indexen
create index if not exists companies_org_idx        on public.companies(organization_id);
create index if not exists companies_normname_idx   on public.companies(normalized_name);
create index if not exists persons_org_idx          on public.persons(organization_id);
create index if not exists persons_email_idx        on public.persons(lower(email));
create index if not exists persons_fullname_idx     on public.persons(full_name);
create index if not exists company_persons_company_idx on public.company_persons(company_id);
create index if not exists company_persons_person_idx  on public.company_persons(person_id);
create index if not exists leads_company_idx        on public.leads(company_id);
create index if not exists clients_company_idx      on public.clients(company_id);
create index if not exists quotes_company_idx       on public.quotes(company_id);

-- updated_at voor companies/persons (eigen functie; raakt gedeelde functie niet).
create or replace function public.tg_contacts_set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.tg_contacts_set_updated_at();
drop trigger if exists persons_set_updated_at on public.persons;
create trigger persons_set_updated_at before update on public.persons
  for each row execute function public.tg_contacts_set_updated_at();

-- ---------------------------------------------------------------------------
-- Sync-triggers: inline identiteit/contact bijwerken vanuit company_id/person_id.
-- (alleen de dedup-/weergave-kritische velden; adres + kvk/website blijven lokaal)
-- ---------------------------------------------------------------------------
create or replace function public.tg_leads_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text; prole text;
begin
  if new.company_id is not null then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  end if;
  if new.person_id is not null then
    select nullif(full_name,''), email, phone, role into pfull, pemail, pphone, prole
    from public.persons where id = new.person_id;
    new.contact_name := pfull; new.contact_email := pemail; new.contact_phone := pphone; new.contact_role := prole;
  end if;
  return new;
end $$;
drop trigger if exists leads_sync_contact on public.leads;
create trigger leads_sync_contact before insert or update on public.leads
  for each row execute function public.tg_leads_sync_contact();

create or replace function public.tg_clients_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text; pphone text;
begin
  if new.company_id is not null then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.company_name := cname; end if;
  end if;
  if new.person_id is not null then
    select nullif(full_name,''), email, phone into pfull, pemail, pphone
    from public.persons where id = new.person_id;
    new.contact_name := pfull; new.contact_email := pemail; new.contact_phone := pphone;
  end if;
  return new;
end $$;
drop trigger if exists clients_sync_contact on public.clients;
create trigger clients_sync_contact before insert or update on public.clients
  for each row execute function public.tg_clients_sync_contact();

create or replace function public.tg_quotes_sync_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text; pfull text; pemail text;
begin
  if new.company_id is not null then
    select name into cname from public.companies where id = new.company_id;
    if cname is not null then new.prospect_company := cname; end if;
  end if;
  if new.person_id is not null then
    select nullif(full_name,''), email into pfull, pemail from public.persons where id = new.person_id;
    new.prospect_contact := pfull; new.prospect_email := pemail;
  end if;
  return new;
end $$;
drop trigger if exists quotes_sync_contact on public.quotes;
create trigger quotes_sync_contact before insert or update on public.quotes
  for each row execute function public.tg_quotes_sync_contact();

-- ---------------------------------------------------------------------------
-- RLS: lezen = intern; beheren = admin/manager/sales
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies','persons','company_persons']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "Internal users can view %1$s" on public.%1$s;', t);
    execute format($p$create policy "Internal users can view %1$s" on public.%1$s for select to authenticated using (app_private.is_internal(auth.uid()));$p$, t);
    execute format('drop policy if exists "Sales team can manage %1$s" on public.%1$s;', t);
    execute format($p$create policy "Sales team can manage %1$s" on public.%1$s for all to authenticated
      using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'))
      with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));$p$, t);
  end loop;
end $$;
