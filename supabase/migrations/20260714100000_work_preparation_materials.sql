-- Werkvoorbereiding: materialen-checklist per installatie-order.
-- De calculatieregels (quote_calculation_lines) zijn bevroren zodra de offerte
-- niet meer concept is; de bestelstatus per materiaal leeft daarom in een eigen
-- muteerbare tabel die naar de bevroren bronregel verwijst (zelfde patroon als
-- installation_orders zelf t.o.v. de bevroren offerte).
--
-- Flow: "Werkvoorbereiding starten" (RPC) seedt de bestelbare regels uit de
-- calculatie (line_type <> 'uren', qty > 0 — de Bestellijst-definitie) en zet
-- work_prep_started_at. Doorsturen naar de installateur kan pas als geen enkele
-- regel meer op 'te_bestellen' staat (gate in de order-handoff edge). De
-- geaggregeerde status synct naar de e-portal-planner (order_lines.preparation_status).

-- 1. Materialen-tabel ---------------------------------------------------------
create table if not exists public.installation_order_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_order_id uuid not null references public.installation_orders(id) on delete cascade,
  -- Bevroren bronregel; set null zodat een verwijderde offerte de checklist niet sloopt.
  source_line_id uuid references public.quote_calculation_lines(id) on delete set null,
  product_id uuid references public.catalog_products(id) on delete set null,
  description text not null,
  supplier text,
  order_number text,
  unit text not null default 'stuk',
  qty numeric(12,2) not null default 1,
  status text not null default 'te_bestellen'
    check (status in ('niet_nodig','te_bestellen','besteld','binnen')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists installation_order_materials_order_idx
  on public.installation_order_materials(installation_order_id);
create index if not exists installation_order_materials_org_idx
  on public.installation_order_materials(organization_id);
-- Idempotent seeden: hoogstens één materiaal-rij per calc-regel per order.
create unique index if not exists installation_order_materials_order_source_uq
  on public.installation_order_materials(installation_order_id, source_line_id)
  where source_line_id is not null;

drop trigger if exists installation_order_materials_touch on public.installation_order_materials;
create trigger installation_order_materials_touch
  before update on public.installation_order_materials
  for each row execute function public.update_updated_at_column();

-- organization_id uit de parent-order vullen als de client hem niet meestuurt.
-- SECDEF in app_private: de trigger moet de order kunnen lezen ongeacht wie schrijft.
create or replace function app_private.fill_material_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    select o.organization_id into new.organization_id
    from public.installation_orders o where o.id = new.installation_order_id;
  end if;
  return new;
end;
$$;

-- NOT NULL blijft gelden: BEFORE-triggers draaien vóór de constraint-check,
-- dus een insert zonder organization_id wordt hier gevuld en passeert alsnog.
drop trigger if exists installation_order_materials_org on public.installation_order_materials;
create trigger installation_order_materials_org
  before insert on public.installation_order_materials
  for each row execute function app_private.fill_material_organization();

-- 2. RLS (patroon quote_calculation_lines: intern lezen, sales-team beheren) ---
alter table public.installation_order_materials enable row level security;

drop policy if exists "Internal users can view installation_order_materials" on public.installation_order_materials;
create policy "Internal users can view installation_order_materials" on public.installation_order_materials
  for select using ((select app_private.is_internal(auth.uid())));

drop policy if exists "Sales team can manage installation_order_materials" on public.installation_order_materials;
create policy "Sales team can manage installation_order_materials" on public.installation_order_materials
  for all
  using ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)));

-- 3. Werkvoorbereidings-kolommen op de order ----------------------------------
alter table public.installation_orders
  add column if not exists work_prep_started_at timestamptz,
  add column if not exists materials_expected_at date,
  add column if not exists preparation_notes text,
  add column if not exists materials_synced_at timestamptz;

comment on column public.installation_orders.work_prep_started_at is
  'Werkvoorbereiding gestart (materialenlijst geseed uit de calculatie). Vereist vóór handoff.';
comment on column public.installation_orders.materials_expected_at is
  'Verwachte leverdatum materialen — synct naar e-portal order_lines.materials_expected_at.';
comment on column public.installation_orders.preparation_notes is
  'Notitie werkvoorbereiding voor de planner — synct naar e-portal order_lines.preparation_notes.';
comment on column public.installation_orders.materials_synced_at is
  'Laatste geslaagde materiaalstatus-sync naar de e-portal.';

-- 4. RPC: werkvoorbereiding starten (idempotent seeden uit de calculatie) ------
-- SECURITY INVOKER: alles wat hier gebeurt mag de aanroeper via RLS al zelf
-- (calc-regels lezen = is_internal, materialen/order schrijven = sales-team).
create or replace function public.start_work_preparation(p_order_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_order public.installation_orders%rowtype;
  v_calc_id uuid;
  v_inserted integer := 0;
begin
  select * into v_order from public.installation_orders where id = p_order_id;
  if not found then
    raise exception 'Installatie-order niet gevonden' using errcode = 'P0002';
  end if;

  -- Bewust overgeslagen calculaties seeden niets; geen calc = lege lijst.
  if v_order.quote_id is not null then
    select qc.id into v_calc_id
    from public.quote_calculations qc
    where qc.quote_id = v_order.quote_id and qc.status <> 'overgeslagen';
  end if;

  if v_calc_id is not null then
    insert into public.installation_order_materials
      (organization_id, installation_order_id, source_line_id, product_id,
       description, supplier, order_number, unit, qty, position)
    select l.organization_id, v_order.id, l.id, l.product_id,
           l.description, l.supplier, l.order_number, l.unit, l.qty, l.position
    from public.quote_calculation_lines l
    where l.calculation_id = v_calc_id
      and l.line_type <> 'uren'
      and l.qty > 0
    on conflict (installation_order_id, source_line_id)
      where source_line_id is not null
      do nothing;
    get diagnostics v_inserted = row_count;
  end if;

  update public.installation_orders
    set work_prep_started_at = coalesce(work_prep_started_at, now())
  where id = p_order_id;

  return v_inserted;
end;
$$;
