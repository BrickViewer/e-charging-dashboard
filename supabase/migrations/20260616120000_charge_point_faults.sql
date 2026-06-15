-- =========================================================================
-- Storingen-module: charge_point_faults + tijdlijn + org-instellingen.
-- Detectie is transitie-gebaseerd (gezond -> storing) in eflux-sync; bestaande
-- offline legacy-palen genereren GEEN storing (geen transitie). Auto-mail
-- (gebundeld per locatie) bij elke nieuw geopende storing. Auto-herstel sluit
-- de storing automatisch.
-- =========================================================================

-- 1. Workflow-enum (de status-state-machine).
do $$ begin
  create type public.fault_status as enum (
    'nieuw', 'eflux_gemeld', 'klant_gecontacteerd', 'bezoek_ingepland',
    'opgelost', 'automatisch_hersteld', 'vals_alarm'
  );
exception when duplicate_object then null; end $$;

-- 2. Severity: harde storing vs zacht 'verdacht' (stale heartbeat; nu niet gebruikt
--    om rijen te openen, staat klaar voor toekomst).
do $$ begin
  create type public.fault_severity as enum ('storing', 'verdacht');
exception when duplicate_object then null; end $$;

-- 3. Hoofd-tabel.
create table if not exists public.charge_point_faults (
  id                      uuid primary key default gen_random_uuid(),
  charge_point_id         uuid not null references public.charge_points(id) on delete cascade,
  location_id             uuid references public.locations(id) on delete set null,
  client_id               uuid references public.clients(id) on delete set null,
  organization_id         uuid references public.organizations(id) on delete set null,
  status                  public.fault_status   not null default 'nieuw',
  severity                public.fault_severity not null default 'storing',
  detected_at             timestamptz not null default now(),
  fault_reason            text not null,
  road_connectivity_state text,
  road_operational_status text,
  first_status            text,
  resolved_at             timestamptz,
  auto_recovered          boolean not null default false,
  assigned_to             uuid references auth.users(id) on delete set null,
  eflux_reported_at       timestamptz,
  customer_contacted_at   timestamptz,
  visit_scheduled_at      timestamptz,
  visit_date              date,
  notes                   text,
  email_sent_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Max één OPEN storing per paal (idempotent over sync-runs heen).
create unique index if not exists charge_point_faults_one_open_per_cp
  on public.charge_point_faults (charge_point_id)
  where status not in ('opgelost','automatisch_hersteld','vals_alarm');

create index if not exists charge_point_faults_status_idx   on public.charge_point_faults (status);
create index if not exists charge_point_faults_detected_idx on public.charge_point_faults (detected_at desc);
create index if not exists charge_point_faults_cp_idx       on public.charge_point_faults (charge_point_id);
create index if not exists charge_point_faults_client_idx   on public.charge_point_faults (client_id);

-- 4. Tijdlijn / action-log per storing.
create table if not exists public.charge_point_fault_events (
  id          uuid primary key default gen_random_uuid(),
  fault_id    uuid not null references public.charge_point_faults(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  event_type  text not null,
  from_status public.fault_status,
  to_status   public.fault_status,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists charge_point_fault_events_fault_idx
  on public.charge_point_fault_events (fault_id, created_at);

-- 5. updated_at trigger (hergebruik generieke functie).
drop trigger if exists trg_charge_point_faults_updated on public.charge_point_faults;
create trigger trg_charge_point_faults_updated
  before update on public.charge_point_faults
  for each row execute function public.tg_contacts_set_updated_at();

-- 6. RLS — intern voor lezen, admin/manager voor beheren.
alter table public.charge_point_faults enable row level security;
alter table public.charge_point_fault_events enable row level security;

drop policy if exists "Internal users can view faults" on public.charge_point_faults;
create policy "Internal users can view faults" on public.charge_point_faults
  for select to authenticated using (app_private.is_internal(auth.uid()));

drop policy if exists "Admins and managers can manage faults" on public.charge_point_faults;
create policy "Admins and managers can manage faults" on public.charge_point_faults
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin'::public.app_role) or app_private.has_role(auth.uid(),'manager'::public.app_role))
  with check (app_private.has_role(auth.uid(),'admin'::public.app_role) or app_private.has_role(auth.uid(),'manager'::public.app_role));

drop policy if exists "Internal users can view fault events" on public.charge_point_fault_events;
create policy "Internal users can view fault events" on public.charge_point_fault_events
  for select to authenticated using (app_private.is_internal(auth.uid()));

drop policy if exists "Admins and managers can manage fault events" on public.charge_point_fault_events;
create policy "Admins and managers can manage fault events" on public.charge_point_fault_events
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin'::public.app_role) or app_private.has_role(auth.uid(),'manager'::public.app_role))
  with check (app_private.has_role(auth.uid(),'admin'::public.app_role) or app_private.has_role(auth.uid(),'manager'::public.app_role));

-- 7. Organisatie-instellingen voor de storingen-module.
alter table public.organizations
  add column if not exists fault_notification_email     text    not null default 'info@e-charging.nl',
  add column if not exists fault_detection_enabled       boolean not null default true,
  add column if not exists fault_heartbeat_grace_minutes integer not null default 60;
