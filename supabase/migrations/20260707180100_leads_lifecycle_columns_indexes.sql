-- Gestructureerde verlies-reden (FK) + verloren-tijdstempel (rapportage-metadata,
-- gespiegeld aan won_at; LOSGEKOPPELD van archiveren). lost_reason (bestaande dode
-- tekstkolom) wordt hergebruikt als optionele vrije notitie.
alter table public.leads
  add column if not exists lost_reason_id uuid references public.lead_lost_reasons(id) on delete set null,
  add column if not exists lost_at timestamptz;

-- Per-fase 'verlopen/stil'-drempel (optioneel; null = uit).
alter table public.lead_stages
  add column if not exists rotting_days integer;

-- Indexen voor snelle, begrensde queries (bord = open; lijst = gefilterd/gesegmenteerd).
create index if not exists leads_org_status_idx on public.leads(organization_id, status);
create index if not exists leads_owner_idx on public.leads(owner_user_id);
create index if not exists leads_stage_idx on public.leads(stage_id);
create index if not exists leads_lost_reason_id_idx on public.leads(lost_reason_id);
create index if not exists installation_orders_lead_invoiced_idx
  on public.installation_orders(lead_id) where invoiced_at is not null;
create index if not exists installation_orders_lead_open_idx
  on public.installation_orders(lead_id) where invoiced_at is null;
