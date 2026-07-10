-- Review-fixes op de calculator-freeze-trigger:
-- 1. DELETE-cascade: bij `delete from quotes` (of leads → quotes) cascadet
--    Postgres de calc-rijen NA het verwijderen van de quote; de status-lookup
--    vindt dan niets (NULL) en de trigger blokkeerde — waardoor elke offerte
--    met een calculatie (ook 'overgeslagen') onverwijderbaar werd. Quote weg
--    = cascade = toestaan.
-- 2. SharePoint-refs (calc_item_id/calc_web_url/calc_uploaded_at) zijn geen
--    inhoudelijke calc-data; de best-effort upload mag ze ook ná verzending
--    nog vastleggen. De UPDATE-freeze geldt daarom alleen voor de
--    inhoudskolommen (UPDATE OF ...).

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

  -- Quote (of calc-kop) bestaat niet meer → dit is een cascade-delete: toestaan.
  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status <> 'concept' then
    raise exception 'Calculatie is bevroren: offerte heeft status % (alleen concept is bewerkbaar)', v_status
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

-- UPDATE-freeze alleen op inhoudskolommen; refs-kolommen blijven schrijfbaar.
drop trigger if exists quote_calculations_freeze on public.quote_calculations;
create trigger quote_calculations_freeze
  before insert or delete or update of
    status, schema_version, hourly_rate, km_price, retour_km, travel_days,
    stelpost_graafwerk, stelpost_note, summary,
    material_sell, material_cost, hours_total, labor_sell, travel_sell,
    total_sell, offer_price_rounded, finalized_at
  on public.quote_calculations
  for each row execute function app_private.enforce_calc_quote_concept();
