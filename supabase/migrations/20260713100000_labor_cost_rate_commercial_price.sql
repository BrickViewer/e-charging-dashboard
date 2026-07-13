-- Arbeid krijgt een inkooptarief (uren ingekocht bij e-group) en de UI-term
-- "Offerteprijs" wordt "Commerciële prijs":
-- 1. Org-standaardwaarden voor het inkoop- (€50) en verkooptarief (€75) per uur,
--    instelbaar via Instellingen → Standaardwaarden; startwaarden voor nieuwe
--    calculaties, per calculatie aanpasbaar (snapshot, zoals hourly_rate).
-- 2. quote_calculations.labor_cost_rate (snapshot) + generated labor_cost —
--    telt alléén mee in de marge, nooit in total_sell/commerciële prijs.
-- 3. Freeze-trigger dekt de nieuwe inhoudskolom.
-- 4. Catalogus-arbeid: gross_price is het inkooptarief → 60 wordt 50.

alter table public.organizations
  add column if not exists default_labor_cost_rate numeric(8,2) not null default 50,
  add column if not exists default_labor_sell_rate numeric(8,2) not null default 75;

comment on column public.organizations.default_labor_cost_rate is
  'Standaard inkooptarief arbeid (e-group) per uur — startwaarde voor nieuwe calculaties, per calculatie aanpasbaar.';
comment on column public.organizations.default_labor_sell_rate is
  'Standaard verkooptarief arbeid per uur — startwaarde voor nieuwe calculaties, per calculatie aanpasbaar.';

alter table public.quote_calculations
  add column if not exists labor_cost_rate numeric(8,2) not null default 50;
alter table public.quote_calculations
  alter column hourly_rate set default 75;
alter table public.quote_calculations
  add column if not exists labor_cost numeric(12,2)
    generated always as (round(hours_total * labor_cost_rate, 2)) stored;

comment on column public.quote_calculations.labor_cost_rate is
  'Inkooptarief arbeid (e-group) per uur — telt alleen mee in de marge, niet in total_sell.';
comment on column public.quote_calculations.offer_price_rounded is
  'UI-term: "Commerciële prijs (afgerond)". Kolomnaam is historisch — een live rename is het risico niet waard.';

-- Freeze-trigger opnieuw: labor_cost_rate is inhoudelijke calc-data en hoort in
-- de UPDATE OF-lijst. labor_cost niet — generated kolommen zijn geen UPDATE-doel.
drop trigger if exists quote_calculations_freeze on public.quote_calculations;
create trigger quote_calculations_freeze
  before insert or delete or update of
    status, schema_version, hourly_rate, labor_cost_rate, km_price, retour_km,
    travel_days, stelpost_graafwerk, stelpost_note, summary,
    material_sell, material_cost, hours_total, labor_sell, travel_sell,
    total_sell, offer_price_rounded, finalized_at
  on public.quote_calculations
  for each row execute function app_private.enforce_calc_quote_concept();

-- Catalogus: gross_price op arbeid-artikelen = het inkooptarief. De guard op
-- 60.00 (de oude seed-waarde) beschermt handmatig aangepaste tarieven.
update public.catalog_products
  set gross_price = 50.00
  where kind = 'arbeid' and gross_price = 60.00;
