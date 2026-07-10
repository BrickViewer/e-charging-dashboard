-- Interne kostencalculator: productcatalogus + calculatie per offerte.
-- Rekenmodel volgt de Excel-werkwijze ("Calculatie laadpaal"): artikel heeft bruto
-- inkoop, leverancierskorting% (→ netto kostprijs), toeslag/korting% op verkoop
-- (verkoop = bruto × (1+toeslag)) en calculatietijd (uur per eenheid). Daarboven
-- uurloon × uren, voorrijkosten (retour-km × €/km × dagen) en stelpost graafwerk.

-- 1. Catalogus ---------------------------------------------------------------
create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'product' check (kind in ('product','arbeid')),
  category text not null default 'overig' check (category in ('laadpalen','installatiemateriaal','overig','arbeid')),
  name text not null,
  supplier text,
  order_number text,
  unit text not null default 'stuk' check (unit in ('stuk','meter','uur')),
  gross_price numeric(12,2) not null default 0,          -- bruto inkoop (lijstprijs)
  supplier_discount_pct numeric(6,4) not null default 0, -- korting leverancier → netto = bruto×(1−pct)
  sell_adjustment_pct numeric(6,4) not null default 0,   -- toeslag/korting verkoop → verkoop = bruto×(1+pct)
  install_time_hours numeric(8,3) not null default 0,    -- calculatietijd per eenheid
  is_active boolean not null default true,
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists catalog_products_org_idx on public.catalog_products(organization_id);

drop trigger if exists catalog_products_touch on public.catalog_products;
create trigger catalog_products_touch before update on public.catalog_products
  for each row execute function public.update_updated_at_column();

-- 2. Calculatie-kop (1:1 met offerte) ----------------------------------------
create table if not exists public.quote_calculations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'concept' check (status in ('concept','afgerond','overgeslagen')),
  schema_version integer not null default 1,
  -- Kop-parameters (defaults = huidige Excel-praktijk)
  hourly_rate numeric(8,2) not null default 60,
  km_price numeric(8,2) not null default 0.75,
  retour_km numeric(8,1) not null default 0,
  travel_days numeric(6,2) not null default 1,
  stelpost_graafwerk numeric(12,2) not null default 0,
  stelpost_note text,
  -- Samenvatting voor tekstgeneratie/xlsx (chargerModel, numPoles, numSockets,
  -- loadBalancer, eindgroepen, eindgroepAmperage, _lastGeneratedLevering)
  summary jsonb not null default '{}',
  -- Totalen (client berekent, hier vastgelegd; marge = materiaal verkoop − inkoop)
  material_sell numeric(12,2) not null default 0,
  material_cost numeric(12,2) not null default 0,
  hours_total numeric(10,2) not null default 0,
  labor_sell numeric(12,2) not null default 0,
  travel_sell numeric(12,2) not null default 0,
  total_sell numeric(12,2) not null default 0,
  margin_material numeric(12,2) generated always as (material_sell - material_cost) stored,
  offer_price_rounded numeric(12,2),
  -- SharePoint CALC-bestand (overschrijfbaar, i.t.t. OFF)
  calc_item_id text,
  calc_web_url text,
  calc_uploaded_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_calculations_org_idx on public.quote_calculations(organization_id);

drop trigger if exists quote_calculations_touch on public.quote_calculations;
create trigger quote_calculations_touch before update on public.quote_calculations
  for each row execute function public.update_updated_at_column();

-- 3. Calculatieregels ---------------------------------------------------------
create table if not exists public.quote_calculation_lines (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references public.quote_calculations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  line_type text not null check (line_type in ('product','vrij','uren')),
  product_id uuid references public.catalog_products(id) on delete set null,
  description text not null,
  category text,
  supplier text,
  order_number text,
  unit text not null default 'stuk',
  qty numeric(12,2) not null default 1,
  -- Prijs-snapshots op moment van toevoegen (catalogus kan daarna wijzigen)
  unit_gross numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  unit_sell numeric(12,2) not null default 0,
  unit_hours numeric(8,3) not null default 0,
  total_cost numeric(14,2) generated always as (round(qty * unit_cost, 2)) stored,
  total_sell numeric(14,2) generated always as (round(qty * unit_sell, 2)) stored,
  total_hours numeric(10,2) generated always as (round(qty * unit_hours, 2)) stored,
  position integer not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists quote_calculation_lines_calc_idx on public.quote_calculation_lines(calculation_id);
create index if not exists quote_calculation_lines_org_idx on public.quote_calculation_lines(organization_id);

-- 4. RLS (patroon lead_lost_reasons: intern lezen, sales-team beheren) ---------
alter table public.catalog_products enable row level security;
alter table public.quote_calculations enable row level security;
alter table public.quote_calculation_lines enable row level security;

drop policy if exists "Internal users can view catalog_products" on public.catalog_products;
create policy "Internal users can view catalog_products" on public.catalog_products
  for select using ((select app_private.is_internal(auth.uid())));
drop policy if exists "Sales team can manage catalog_products" on public.catalog_products;
create policy "Sales team can manage catalog_products" on public.catalog_products
  for all
  using ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)));

drop policy if exists "Internal users can view quote_calculations" on public.quote_calculations;
create policy "Internal users can view quote_calculations" on public.quote_calculations
  for select using ((select app_private.is_internal(auth.uid())));
drop policy if exists "Sales team can manage quote_calculations" on public.quote_calculations;
create policy "Sales team can manage quote_calculations" on public.quote_calculations
  for all
  using ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)));

drop policy if exists "Internal users can view quote_calculation_lines" on public.quote_calculation_lines;
create policy "Internal users can view quote_calculation_lines" on public.quote_calculation_lines
  for select using ((select app_private.is_internal(auth.uid())));
drop policy if exists "Sales team can manage quote_calculation_lines" on public.quote_calculation_lines;
create policy "Sales team can manage quote_calculation_lines" on public.quote_calculation_lines
  for all
  using ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(),'admin'::app_role))
      or (select app_private.has_role(auth.uid(),'manager'::app_role))
      or (select app_private.has_role(auth.uid(),'sales'::app_role)));

-- 5. Freeze-guard: calculatie volgt de bevries-semantiek van de offerte --------
-- (SECDEF: les uit de SharePoint-dossier-regressie — app_private-triggers moeten
-- onafhankelijk van de aanroeper kunnen lezen)
create or replace function app_private.enforce_calc_quote_concept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_status text;
begin
  if tg_table_name = 'quote_calculations' then
    v_quote_id := coalesce(new.quote_id, old.quote_id);
  else
    select qc.quote_id into v_quote_id
    from public.quote_calculations qc
    where qc.id = coalesce(new.calculation_id, old.calculation_id);
  end if;

  select q.status into v_status from public.quotes q where q.id = v_quote_id;
  if v_status is distinct from 'concept' then
    raise exception 'Calculatie is bevroren: offerte heeft status % (alleen concept is bewerkbaar)', v_status
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_calculations_freeze on public.quote_calculations;
create trigger quote_calculations_freeze
  before insert or update or delete on public.quote_calculations
  for each row execute function app_private.enforce_calc_quote_concept();

drop trigger if exists quote_calculation_lines_freeze on public.quote_calculation_lines;
create trigger quote_calculation_lines_freeze
  before insert or update or delete on public.quote_calculation_lines
  for each row execute function app_private.enforce_calc_quote_concept();

-- 6. Seed: artikelen uit de bestaande calculatie-Excel (idempotent per org) ----
insert into public.catalog_products
  (organization_id, kind, category, name, supplier, order_number, unit, gross_price, supplier_discount_pct, sell_adjustment_pct, install_time_hours, position)
select o.id, x.kind, x.category, x.name, x.supplier, x.order_number, x.unit, x.gross, x.korting, x.toeslag, x.uren, x.position
from public.organizations o
cross join (values
  -- Laadpalen e.d. (leverancierskorting Zaptec/Peblar-lijn: 20%)
  ('product','laadpalen','Zaptec GO 2 Asphalt Black 22 kW', null, 'ZAP-900-00120', 'stuk', 834.00, 0.20, 0.0, 0.0, 0),
  ('product','laadpalen','Zaptec PRO Laadpaal + Backplate 22kW', null, 'C-ZAP-900-00021', 'stuk', 1151.56, 0.20, 0.0, 0.0, 1),
  ('product','laadpalen','Zaptec Sense P1 Module', null, 'ZAP-900-00114', 'stuk', 72.86, 0.20, 0.0, 0.0, 2),
  ('product','laadpalen','Zaptec Sense bundle + 3-fase energiemeter (ex meetspoelen!)', null, 'ZAP-ZM000829', 'stuk', 435.69, 0.20, 0.0, 0.0, 3),
  ('product','laadpalen','Zaptec onepole montagepaal Zaptec GO2 compleet', null, 'C-OP-Lite-ZapGo-N-S', 'stuk', 330.55, 0.20, 0.0, 0.0, 4),
  ('product','laadpalen','Zaptec onepole montagepaal Zaptec PRO (ruggen tegen elkaar)', null, 'C-OP-Q9MSL-zpro-nr', 'stuk', 537.20, 0.20, 0.0, 0.0, 5),
  ('product','laadpalen','Zaptec onepole montagepaal Zaptec PRO (enkele laadpaal)', null, 'C-OP-Q9MSL-Zappro-1', 'stuk', 501.87, 0.20, 0.0, 0.0, 6),
  ('product','laadpalen','Diverse kleuren frontjes Zaptec GO2', null, null, 'stuk', 36.30, 0.20, 0.0, 0.0, 7),
  ('product','laadpalen','Peblar Home 11kW 5 meter kabel', null, '2850602319', 'stuk', 617.00, 0.20, 0.0, 0.0, 8),
  ('product','laadpalen','Peblar Home 11kW 7 meter kabel', null, '2850646521', 'stuk', 692.00, 0.20, 0.0, 0.0, 9),
  ('product','laadpalen','Peblar Business 22kW Socket', null, '2850647073', 'stuk', 920.00, 0.20, 0.0, 0.0, 10),
  ('product','laadpalen','Peblar paal single vloermontage', null, '2850602324', 'stuk', 187.50, 0.20, 0.0, 0.0, 11),
  ('product','laadpalen','Peblar paal dubbel vloermontage', null, '2850602333', 'stuk', 204.68, 0.20, 0.0, 0.0, 12),
  ('product','laadpalen','Peblar paal metalen fundatiepaal', null, '2850641767', 'stuk', 93.75, 0.20, 0.0, 0.0, 13),
  ('product','laadpalen','Peblar montageplaat tbv paal', null, '2850605082', 'stuk', 60.83, 0.20, 0.0, 0.0, 14),
  ('product','laadpalen','HomeWizard P1 meter tbv loadbalancing Peblar (enkel bij één Peblar, tot 80A)', null, '2850641169', 'stuk', 25.00, 0.0, 0.0, 0.0, 15),
  -- Installatiemateriaal (leverancier + korting uit de Excel)
  ('product','installatiemateriaal','Draka VULTO Dca VO-YMvKas voedingskabel 4x4 (per meter)', 'TU', '4604218', 'meter', 31.80, 0.52, -0.32, 0.0, 20),
  ('product','installatiemateriaal','Draka VULTO Dca VO-YMvKas voedingskabel 4x6 (per meter)', 'TU', '4604358', 'meter', 46.00, 0.52, -0.32, 0.0, 21),
  ('product','installatiemateriaal','YMvK-as grondkabel 4x4 (per meter)', 'Elektramat', '401169461', 'meter', 5.28, 0.07, 0.0, 0.0, 22),
  ('product','installatiemateriaal','YMvK-as grondkabel 4x6 (per meter)', 'Elektramat', '401169463', 'meter', 7.76, 0.07, 0.0, 0.0, 23),
  ('product','installatiemateriaal','Pipelife Polvalit VSV installatiebuis 25mm lg4', 'TU', '9060958', 'stuk', 35.93, 0.69, -0.40, 0.0, 24),
  ('product','installatiemateriaal','Pipelife Polvalit VSV ET-buis 1 grs lg4', 'TU', '406090', 'stuk', 32.66, 0.69, -0.40, 0.0, 25),
  ('product','installatiemateriaal','Meterkast (groepenkast op maat)', 'Elektramat', null, 'stuk', 1900.00, 0.0, 0.20, 8.0, 26),
  ('product','installatiemateriaal','Eaton aardlekautomaat B20 30mA', 'Elektramat', '401335536', 'stuk', 173.99, 0.05, 0.0, 0.0, 27),
  ('product','installatiemateriaal','Eaton Xpole aardlekautomaat 4p B20/30mA', 'TU', '2027285', 'stuk', 299.66, 0.575, 0.0, 0.0, 28),
  ('product','installatiemateriaal','Hager HACO aardlekautomaat 4p 20A B-k 30mA kl.A 6kA', 'TU', '9405091', 'stuk', 260.00, 0.51, 0.0, 0.0, 29),
  ('product','installatiemateriaal','Hager HACO aardlekautomaat 4p 40A B-k 30mA kl.A 6kA', 'TU', '9405112', 'stuk', 266.00, 0.51, 0.0, 0.0, 30),
  -- Arbeid
  ('arbeid','arbeid','Monteur', null, null, 'uur', 60.00, 0.0, 0.0, 1.0, 40),
  ('arbeid','arbeid','Montage + inregelen laadpalen', null, null, 'uur', 60.00, 0.0, 0.0, 1.0, 41)
) as x(kind, category, name, supplier, order_number, unit, gross, korting, toeslag, uren, position)
where not exists (select 1 from public.catalog_products p where p.organization_id = o.id);
