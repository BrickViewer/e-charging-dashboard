-- Activatiekosten factureren: bijhouden wat er al gefactureerd is.
--
-- Ontwerpkeuze: het "al gefactureerd"-bedrag wordt HERBEREKEND uit de factuurspiegel, niet
-- opgeteld met een delta. Set-based herberekenen maakt dubbel versturen idempotent, en
-- crediteren/concept-verwijderen corrigeert zichzelf zonder extra code in wefact-invoice-actions.
--
-- wefact_invoices.client_id is hiervoor ONBRUIKBAAR: die kolom wordt door wefact-status-sync
-- elke nacht herschreven uit een debtor-map (en staat live op NULL bij F2026-13105). Vandaar een
-- eigen kolom die alléén onze eigen edge schrijft en die de sync niet in zijn upsert noemt.

-- 1. Hoeveel activatie zat er op DEZE factuur, en van wie
alter table public.wefact_invoices
  add column if not exists activation_amount_excl numeric,
  add column if not exists activation_client_id uuid references public.clients(id) on delete set null;

comment on column public.wefact_invoices.activation_amount_excl is
  'Deel van deze factuur dat activatiekosten was (excl. BTW). Alleen geschreven door wefact-create-invoice.';
comment on column public.wefact_invoices.activation_client_id is
  'Klant wiens activatiekosten op deze factuur staan. Los van client_id, die door de status-sync herschreven wordt.';

-- 2. Afgeleide cache op de klant (nooit met de hand schrijven)
alter table public.clients
  add column if not exists activation_invoiced_total numeric not null default 0,
  add column if not exists activation_invoiced_at timestamptz,
  add column if not exists activation_invoice_code text;

comment on column public.clients.activation_invoiced_total is
  'TRIGGER-CACHE: som van verstuurde, niet-gecrediteerde activatieregels. Herberekend door app_private.recalc_activation_invoiced.';

-- 3. De herberekening
create or replace function app_private.recalc_activation_invoiced(p_client_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.clients c set
    activation_invoiced_total = coalesce(s.total, 0),
    activation_invoiced_at    = s.laatste,
    activation_invoice_code   = s.code
  from (
    select
      sum(w.activation_amount_excl)                                        as total,
      max(w.synced_at)                                                     as laatste,
      (array_agg(w.invoice_code order by w.synced_at desc nulls last))[1]  as code
    from public.wefact_invoices w
    left join public.installation_orders o on o.id = w.installation_order_id
    where coalesce(w.activation_client_id, o.client_id) = p_client_id
      and w.activation_amount_excl is not null
      -- alleen ECHT verstuurd, en niet gecrediteerd (8) of vervallen (9)
      and coalesce(w.sent, 0) > 0
      and coalesce(w.status_code, 0) not in (8, 9)
  ) s
  where c.id = p_client_id;
$$;

revoke all on function app_private.recalc_activation_invoiced(uuid) from public, anon, authenticated;

-- 4. Triggers: elke wijziging aan de spiegel herberekent de betrokken klant(en)
create or replace function app_private.tg_recalc_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_table_name = 'wefact_invoices' then
    if tg_op <> 'INSERT' then
      select coalesce(old.activation_client_id, o.client_id) into v_old
      from (select 1) x left join public.installation_orders o on o.id = old.installation_order_id;
    end if;
    if tg_op <> 'DELETE' then
      select coalesce(new.activation_client_id, o.client_id) into v_new
      from (select 1) x left join public.installation_orders o on o.id = new.installation_order_id;
    end if;
  else -- installation_orders: de order is aan een (andere) klant gekoppeld
    v_old := old.client_id;
    v_new := new.client_id;
  end if;

  if v_old is not null then perform app_private.recalc_activation_invoiced(v_old); end if;
  if v_new is not null and v_new is distinct from v_old then perform app_private.recalc_activation_invoiced(v_new); end if;
  return null;
end;
$$;

drop trigger if exists wefact_invoices_recalc_activation on public.wefact_invoices;
create trigger wefact_invoices_recalc_activation
  after insert or update or delete on public.wefact_invoices
  for each row execute function app_private.tg_recalc_activation();

drop trigger if exists installation_orders_recalc_activation on public.installation_orders;
create trigger installation_orders_recalc_activation
  after update of client_id on public.installation_orders
  for each row when (old.client_id is distinct from new.client_id)
  execute function app_private.tg_recalc_activation();
