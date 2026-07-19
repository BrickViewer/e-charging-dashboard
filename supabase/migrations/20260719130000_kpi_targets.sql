-- Doelen (targets) per KPI voor het directie-werkblad: per metric per jaar een
-- jaardoel (month null) en/of maanddoelen (month 1-12). Directie-informatie:
-- alleen admins kunnen lezen én schrijven.

create table if not exists public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metric text not null,
  year integer not null check (year between 2020 and 2100),
  month integer check (month between 1 and 12),
  target_value numeric not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eén doel per (metric, periode); jaardoel telt als month 0.
create unique index if not exists kpi_targets_metric_period_uq
  on public.kpi_targets (organization_id, metric, year, coalesce(month, 0));

alter table public.kpi_targets enable row level security;

drop policy if exists "Admins manage kpi_targets" on public.kpi_targets;
create policy "Admins manage kpi_targets" on public.kpi_targets
  for all
  using (app_private.has_role(auth.uid(), 'admin'::public.app_role))
  with check (app_private.has_role(auth.uid(), 'admin'::public.app_role));
