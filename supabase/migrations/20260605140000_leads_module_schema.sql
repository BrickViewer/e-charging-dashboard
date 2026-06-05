-- ============================================================================
-- Leads-module: CRM-Kanban datamodel (lead_stages, leads, lead_tasks,
-- lead_stage_tasks, lead_activities) + RLS + triggers + seed.
-- RLS: lezen via app_private.is_internal; beheren via admin/manager/sales.
-- ============================================================================

-- 1) lead_stages — instelbare Kanban-kolommen
create table if not exists public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  color text not null default '#64748b',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lead_stages_org_position_idx on public.lead_stages (organization_id, position);

-- 2) leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stage_id uuid references public.lead_stages(id) on delete set null,
  position integer not null default 0,
  -- bedrijf
  company_name text not null,
  kvk text,
  website text,
  sector text,
  -- contact
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  -- locatie
  address_street text,
  postal_code text,
  city text,
  location_type text,
  -- behoefte (e-charging)
  estimated_charge_points integer,
  estimated_kwh_per_month numeric,
  charger_type text,
  owns_property boolean,
  parking_spaces integer,
  has_solar boolean,
  grid_notes text,
  -- sales
  source text not null default 'manual',
  owner_user_id uuid references auth.users(id) on delete set null,
  estimated_value numeric,
  expected_close_date date,
  priority text not null default 'medium',
  -- status
  status text not null default 'open',
  lost_reason text,
  -- links naar bestaande pipeline
  converted_client_id uuid references public.clients(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  configurator_session_id uuid,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_org_stage_position_idx on public.leads (organization_id, stage_id, position);
create index if not exists leads_owner_idx on public.leads (owner_user_id);

-- 3) lead_tasks — to-do's per lead
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  position integer not null default 0,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_tasks_lead_idx on public.lead_tasks (lead_id);

-- 4) lead_stage_tasks — sjablonen per fase
create table if not exists public.lead_stage_tasks (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.lead_stages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lead_stage_tasks_stage_idx on public.lead_stage_tasks (stage_id, position);

-- 5) lead_activities — tijdlijn
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- BEFORE: updated_at + status afgeleid van de fase (is_won/is_lost)
create or replace function public.tg_leads_set_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_won boolean; v_lost boolean;
begin
  if (tg_op = 'INSERT') or (new.stage_id is distinct from old.stage_id) then
    if new.stage_id is not null then
      select is_won, is_lost into v_won, v_lost from public.lead_stages where id = new.stage_id;
      if v_won then new.status := 'won';
      elsif v_lost then new.status := 'lost';
      else new.status := 'open';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists leads_set_status on public.leads;
create trigger leads_set_status before insert or update on public.leads
  for each row execute function public.tg_leads_set_status();

-- AFTER: activiteit loggen + fase-sjabloon-to-do's toepassen
create or replace function public.tg_leads_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.lead_activities(lead_id, organization_id, user_id, type, description, metadata)
    values (new.id, new.organization_id, auth.uid(), 'created', 'Lead aangemaakt',
            jsonb_build_object('source', new.source));
    if new.stage_id is not null then
      insert into public.lead_tasks(lead_id, organization_id, title, position, created_by)
      select new.id, new.organization_id, t.title, t.position, auth.uid()
      from public.lead_stage_tasks t where t.stage_id = new.stage_id;
    end if;
  elsif (tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id) then
    insert into public.lead_activities(lead_id, organization_id, user_id, type, description, metadata)
    values (new.id, new.organization_id, auth.uid(), 'stage_change', 'Verplaatst naar andere fase',
            jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id));
    if new.stage_id is not null then
      insert into public.lead_tasks(lead_id, organization_id, title, position, created_by)
      select new.id, new.organization_id, t.title, t.position, auth.uid()
      from public.lead_stage_tasks t
      where t.stage_id = new.stage_id
        and not exists (select 1 from public.lead_tasks lt where lt.lead_id = new.id and lt.title = t.title);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists leads_after on public.leads;
create trigger leads_after after insert or update on public.leads
  for each row execute function public.tg_leads_after();

-- ---------------------------------------------------------------------------
-- RLS — lezen: intern; beheren: admin/manager/sales
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lead_stages','leads','lead_tasks','lead_stage_tasks','lead_activities']
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

-- ---------------------------------------------------------------------------
-- Seed default-fasen voor de bestaande organisatie (eenmalig)
-- ---------------------------------------------------------------------------
do $$
declare org uuid;
begin
  select id into org from public.organizations order by created_at asc limit 1;
  if org is not null and not exists (select 1 from public.lead_stages where organization_id = org) then
    insert into public.lead_stages (organization_id, name, position, color, is_won, is_lost, is_default) values
      (org, 'Nieuw',                  0, '#3b82f6', false, false, true),
      (org, 'Gekwalificeerd',         1, '#8b5cf6', false, false, false),
      (org, 'Offerte / Configuratie', 2, '#f59e0b', false, false, false),
      (org, 'Onderhandeling',         3, '#06b6d4', false, false, false),
      (org, 'Gewonnen',               4, '#22c55e', true,  false, false),
      (org, 'Verloren',               5, '#ef4444', false, true,  false);
  end if;
end $$;
