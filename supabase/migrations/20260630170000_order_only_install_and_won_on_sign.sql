-- Doel: bij ondertekening (status -> 'getekend') gaat de lead betrouwbaar naar 'Gewonnen' (alle scopes)
-- en krijgt een 'alleen installatie'-offerte automatisch een CLIENTLOZE installatie-order (order-only pad).
-- Transactioneel via trigger -> onafhankelijk van de edge (die de lead-stap stil liet mislukken via een
-- niet-bestaande kolom quote_id).

-- 1) Clientloze installatie-order vanuit een getekende alleen-installatie-offerte (idempotent).
create or replace function public.create_order_from_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  q public.quotes%rowtype;
  l public.leads%rowtype;
  v_company uuid;
  v_order uuid;
begin
  select * into q from public.quotes where id = p_quote_id;
  if not found then return null; end if;
  -- Alleen 'alleen installatie' (installatie zonder beheer); andere scopes lopen via klant-aanmaken.
  if not (coalesce(q.with_installation, true) and not coalesce(q.with_management, true)) then
    return null;
  end if;
  -- Idempotent: nooit dubbel.
  select id into v_order from public.installation_orders where quote_id = q.id limit 1;
  if v_order is not null then return v_order; end if;
  if q.lead_id is not null then select * into l from public.leads where id = q.lead_id; end if;
  v_company := coalesce(q.company_id, l.company_id);
  insert into public.installation_orders (organization_id, client_id, quote_id, lead_id, company_id, status, notes)
  values (q.organization_id, null, q.id, q.lead_id, v_company, 'nieuw',
          'Alleen-installatie order vanuit getekende offerte ' || coalesce(q.quote_number, ''))
  returning id into v_order;
  return v_order;
end;
$$;

-- SECDEF-RPC afschermen tegen directe PostgREST-aanroep; de trigger draait als definer en heeft dit niet nodig.
revoke all on function public.create_order_from_quote(uuid) from public, anon, authenticated;

-- 2) Trigger: bij overgang naar 'getekend' -> lead naar Gewonnen + (alleen-installatie) clientloze order.
create or replace function public.handle_quote_signed()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_won uuid;
begin
  if new.status = 'getekend' and (old.status is distinct from new.status) then
    if new.lead_id is not null then
      select id into v_won from public.lead_stages
        where organization_id = new.organization_id and is_won = true
        order by position asc limit 1;
      if v_won is not null then
        update public.leads set stage_id = v_won, updated_at = now() where id = new.lead_id;
      end if;
    end if;
    perform public.create_order_from_quote(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_after_sign on public.quotes;
create trigger quotes_after_sign
  after update of status on public.quotes
  for each row execute function public.handle_quote_signed();
