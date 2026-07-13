-- Bestellinks in de werkvoorbereiding lopen via product_id → catalog_products
-- (order_url/extra_links). Calc-regels kunnen hun product_id kwijt zijn: wordt
-- een catalogusartikel verwijderd en opnieuw aangemaakt, dan zet de FK hem op
-- NULL terwijl het bestelnummer-snapshot wél bewaard blijft. Seed daarom met
-- een fallback-match op bestelnummer (exact, case-insensitief), en repareer
-- bestaande materiaalregels eenmalig op dezelfde manier.

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
    select l.organization_id, v_order.id, l.id,
           -- Productkoppeling (voor de bestellink): de regel zelf, anders het
           -- bestelnummer terugzoeken in de catalogus.
           coalesce(
             l.product_id,
             (select cp.id from public.catalog_products cp
              where cp.organization_id = l.organization_id
                and cp.order_number is not null
                and l.order_number is not null and btrim(l.order_number) <> ''
                and lower(btrim(cp.order_number)) = lower(btrim(l.order_number))
              order by cp.is_active desc, cp.position
              limit 1)
           ),
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

-- Eenmalige reparatie: bestaande materiaalregels zonder productkoppeling alsnog
-- aan de catalogus hangen via het bestelnummer.
update public.installation_order_materials m
set product_id = (
  select cp.id from public.catalog_products cp
  where cp.organization_id = m.organization_id
    and cp.order_number is not null
    and lower(btrim(cp.order_number)) = lower(btrim(m.order_number))
  order by cp.is_active desc, cp.position
  limit 1
)
where m.product_id is null
  and m.order_number is not null
  and btrim(m.order_number) <> '';
