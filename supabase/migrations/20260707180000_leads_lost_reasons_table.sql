-- Per-org, beheerbare verlies-redenen (spiegelt het lead_stages-patroon). Voedt de
-- verplichte reden-keuze bij 'Markeer verloren' en de 'Verloren per reden'-rapportage.
create table if not exists public.lead_lost_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists lead_lost_reasons_org_idx on public.lead_lost_reasons(organization_id);

alter table public.lead_lost_reasons enable row level security;

drop policy if exists "Internal users can view lead_lost_reasons" on public.lead_lost_reasons;
create policy "Internal users can view lead_lost_reasons" on public.lead_lost_reasons
  for select using ((select app_private.is_internal(auth.uid())));

drop policy if exists "Sales team can manage lead_lost_reasons" on public.lead_lost_reasons;
create policy "Sales team can manage lead_lost_reasons" on public.lead_lost_reasons
  for all
  using ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)));

-- NL-starterlijst per organisatie (idempotent: alleen als de org er nog geen heeft).
insert into public.lead_lost_reasons (organization_id, label, position)
select o.id, x.label, x.position
from public.organizations o
cross join (values
  ('Prijs / te duur', 0),
  ('Gekozen voor concurrent', 1),
  ('Geen budget', 2),
  ('Timing / uitgesteld', 3),
  ('Geen beslissing', 4),
  ('Scope / techniek niet passend', 5),
  ('Onbereikbaar / afgehaakt', 6),
  ('Overig', 7)
) as x(label, position)
where not exists (select 1 from public.lead_lost_reasons r where r.organization_id = o.id);
