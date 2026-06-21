-- ============================================================================
-- RECONCILIATIE-SNAPSHOT (Fase 0 architectuur-audit) — GEEN gedragswijziging.
-- Deze objecten BESTAAN AL LIVE; ze waren alleen nooit in version control vastgelegd
-- (ze zijn destijds via de Supabase MCP-tools toegepast zonder lokaal migratiebestand).
-- Dit bestand maakt de geld-kern herspeelbaar vanaf nul (DR / staging / onboarding).
-- Volledig idempotent: veilig op een verse DB én een no-op op de live DB.
-- Bron: pg_get_functiondef / information_schema op project uuldldhmuanmjlyvnagt (2026-06-21).
-- ============================================================================

-- ---- settlements: tabel + sequence + indexen + constraints --------------------
create sequence if not exists public.settlements_invoice_seq;

create table if not exists public.settlements (
  id                    uuid not null default gen_random_uuid(),
  client_id             uuid not null,
  year                  integer not null,
  month                 integer not null,
  period_start          date not null,
  period_end            date not null,
  total_kwh             numeric not null default 0,
  total_sessions        integer not null default 0,
  gross_revenue         numeric not null default 0,
  echarging_fee_per_kwh numeric not null default 0,
  echarging_revenue     numeric not null default 0,
  client_payout         numeric not null default 0,
  ere_estimate          numeric not null default 0,
  status                text not null default 'calculated',
  eflux_reimbursed_at   timestamptz,
  invoice_sent_at       timestamptz,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  vat_rate              numeric not null default 0.21,
  fee_waived            boolean not null default false,
  invoice_number        text,
  vat_status            text,
  constraint settlements_pkey primary key (id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'settlements_client_id_fkey') then
    alter table public.settlements add constraint settlements_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settlements_client_period_unique') then
    alter table public.settlements add constraint settlements_client_period_unique unique (client_id, year, month);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settlements_month_check') then
    alter table public.settlements add constraint settlements_month_check check ((month >= 1) and (month <= 12));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settlements_status_check') then
    alter table public.settlements add constraint settlements_status_check check (status = any (array[
      'live','calculated','approved','paid','invoice_sent','invoice_paid','charged_back','overdue']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settlements_vat_status_check') then
    alter table public.settlements add constraint settlements_vat_status_check check (
      (vat_status is null) or (vat_status = any (array['vat_liable','kor','private'])));
  end if;
end $$;

create unique index if not exists settlements_invoice_number_key on public.settlements (invoice_number) where (invoice_number is not null);
create index if not exists settlements_client_idx on public.settlements (client_id);
create index if not exists settlements_period_idx on public.settlements (year, month);
create index if not exists settlements_status_idx on public.settlements (status);

-- ---- RLS (alleen SELECT; schrijven via service_role + SECURITY DEFINER RPC's) -
alter table public.settlements enable row level security;
drop policy if exists "Internal users can view all settlements" on public.settlements;
create policy "Internal users can view all settlements" on public.settlements
  as permissive for select to authenticated
  using (app_private.is_internal(auth.uid()));
drop policy if exists "Portal user can view own final settlements" on public.settlements;
create policy "Portal user can view own final settlements" on public.settlements
  as permissive for select to authenticated
  using ((client_id = app_private.get_client_id_for_user(auth.uid()))
    and (status = any (array['approved','paid','invoice_sent','invoice_paid','charged_back'])));
drop policy if exists "Restrict portal settlement detail to final statuses" on public.settlements;
create policy "Restrict portal settlement detail to final statuses" on public.settlements
  as restrictive for select to authenticated
  using (app_private.is_internal(auth.uid())
    or ((client_id = app_private.get_client_id_for_user(auth.uid()))
        and (status = any (array['approved','paid','invoice_sent','invoice_paid','charged_back']))));

-- ---- Doorlopend factuurnummer ECF-YYYY-NNNNN ---------------------------------
create or replace function public.next_settlement_invoice_number()
 returns text language sql security definer set search_path to 'public'
as $function$
  select 'ECF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.settlements_invoice_seq')::text, 5, '0');
$function$;

-- ---- Settlement state-machine RPC's (admin/manager, SECURITY DEFINER) ---------
create or replace function public.approve_settlements(settlement_ids uuid[])
 returns table(approved_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_requested integer;
  v_found integer;
  v_approved integer;
  v_org_problems text;
  v_problems text;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag afrekeningen goedkeuren' using errcode = '42501';
  end if;

  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;

  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;

  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status <> 'calculated') then
    raise exception 'Alleen berekende afrekeningen kunnen worden goedgekeurd';
  end if;

  select nullif(concat_ws(', ',
    case when coalesce(btrim(o.name), '') = '' then 'bedrijfsnaam' end,
    case when coalesce(btrim(o.address_street), '') = '' then 'straat' end,
    case when coalesce(btrim(o.address_postal), '') = '' then 'postcode' end,
    case when coalesce(btrim(o.address_city), '') = '' then 'plaats' end,
    case when o.kvk is null or o.kvk !~ '^[0-9]{8}$' or o.kvk = '12345678' then 'KVK-nummer (geen placeholder)' end,
    case when coalesce(btrim(o.btw_number), '') = '' then 'BTW-nummer' end,
    case when coalesce(btrim(o.iban), '') = '' then 'IBAN' end
  ), '') into v_org_problems
  from public.organizations o order by o.created_at limit 1;

  if v_org_problems is not null then
    raise exception 'Goedkeuren geblokkeerd — factuurgegevens van de eigen organisatie onvolledig (Instellingen → Bedrijf): %', v_org_problems;
  end if;

  select string_agg(line, ' | ') into v_problems
  from (
    select format('%s (%s-%s): %s',
             coalesce(c.company_name, 'Onbekende klant'), s.year, lpad(s.month::text, 2, '0'),
             concat_ws(', ',
               case when c.vat_status is null then 'BTW-status niet opgegeven' end,
               case when c.vat_status is not null and c.vat_status_confirmed_at is null
                    then 'BTW-status niet bevestigd door admin' end,
               case when coalesce(btrim(c.company_name), '') = '' then 'bedrijfsnaam' end,
               case when coalesce(btrim(c.billing_address_street), '') = '' then 'factuuradres (straat)' end,
               case when coalesce(btrim(c.billing_address_postal), '') = '' then 'postcode' end,
               case when coalesce(btrim(c.billing_address_city), '') = '' then 'plaats' end,
               case when c.vat_status in ('vat_liable','kor') and coalesce(btrim(c.kvk), '') = '' then 'KvK-nummer' end,
               case when c.vat_status = 'vat_liable' and coalesce(btrim(c.btw_number), '') = '' then 'BTW-nummer' end,
               case when c.client_number is null then 'klantnummer' end,
               case when coalesce(btrim(d.payout_iban), '') = '' then 'IBAN (uitbetaling)' end,
               case when coalesce(btrim(d.payout_account_holder_name), '') = '' then 'rekeninghouder' end
             )) as line
    from public.settlements s
    join public.clients c on c.id = s.client_id
    left join public.client_payment_details d on d.client_id = c.id
    where s.id = any(settlement_ids)
      and (c.vat_status is null
        or c.vat_status_confirmed_at is null
        or coalesce(btrim(c.company_name), '') = ''
        or coalesce(btrim(c.billing_address_street), '') = ''
        or coalesce(btrim(c.billing_address_postal), '') = ''
        or coalesce(btrim(c.billing_address_city), '') = ''
        or (c.vat_status in ('vat_liable','kor') and coalesce(btrim(c.kvk), '') = '')
        or (c.vat_status = 'vat_liable' and coalesce(btrim(c.btw_number), '') = '')
        or c.client_number is null
        or coalesce(btrim(d.payout_iban), '') = ''
        or coalesce(btrim(d.payout_account_holder_name), '') = '')
  ) problems;

  if v_problems is not null then
    raise exception 'Goedkeuren geblokkeerd — factuurgegevens onvolledig: %', v_problems;
  end if;

  update public.settlements s
  set status = 'approved',
      invoice_number = coalesce(s.invoice_number, public.next_settlement_invoice_number()),
      vat_status = c.vat_status,
      updated_at = now()
  from public.clients c
  where c.id = s.client_id and s.id = any(settlement_ids) and s.status = 'calculated';

  get diagnostics v_approved = row_count;
  return query select v_approved;
end;
$function$;

create or replace function public.unapprove_settlements(settlement_ids uuid[])
 returns table(unapproved_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare v_requested integer; v_found integer; v_unapproved integer;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag goedkeuringen terugdraaien' using errcode = '42501';
  end if;
  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;
  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status <> 'approved') then
    raise exception 'Alleen goedgekeurde afrekeningen kunnen worden teruggedraaid (betaald/gefactureerd is definitief)';
  end if;
  update public.settlements s set status = 'calculated', updated_at = now()
  where s.id = any(settlement_ids) and s.status = 'approved';
  get diagnostics v_unapproved = row_count;
  return query select v_unapproved;
end;
$function$;

create or replace function public.mark_settlements_eflux_reimbursed(settlement_ids uuid[])
 returns table(reimbursed_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare v_requested integer; v_found integer; v_marked integer;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag e-Flux uitbetaling vastleggen' using errcode = '42501';
  end if;
  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;
  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status not in ('approved','paid')) then
    raise exception 'Alleen goedgekeurde afrekeningen kunnen als e-Flux-uitbetaald worden gemarkeerd';
  end if;
  update public.settlements s set eflux_reimbursed_at = coalesce(s.eflux_reimbursed_at, now()), updated_at = now()
  where s.id = any(settlement_ids);
  get diagnostics v_marked = row_count;
  return query select v_marked;
end;
$function$;

create or replace function public.mark_settlements_paid(settlement_ids uuid[])
 returns table(paid_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare v_requested integer; v_found integer; v_paid integer;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag afrekeningen als betaald markeren' using errcode = '42501';
  end if;
  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;
  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status <> 'approved') then
    raise exception 'Alleen goedgekeurde afrekeningen kunnen als betaald worden gemarkeerd';
  end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.eflux_reimbursed_at is null) then
    raise exception 'Markeer eerst dat e-Flux heeft uitbetaald voordat de klant wordt uitbetaald';
  end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and coalesce(s.client_payout, 0) < 0) then
    raise exception 'Negatieve afrekeningen moeten via de factuurflow worden verwerkt';
  end if;
  update public.settlements s set status = 'paid', paid_at = now(), updated_at = now()
  where s.id = any(settlement_ids) and s.status = 'approved' and coalesce(s.client_payout, 0) >= 0;
  get diagnostics v_paid = row_count;
  return query select v_paid;
end;
$function$;

create or replace function public.mark_settlements_invoice_sent(settlement_ids uuid[])
 returns table(sent_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare v_requested integer; v_found integer; v_sent integer;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag factuurstatussen verwerken' using errcode = '42501';
  end if;
  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;
  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status <> 'approved') then
    raise exception 'Alleen goedgekeurde afrekeningen kunnen als factuur verzonden worden gemarkeerd';
  end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and coalesce(s.client_payout, 0) >= 0) then
    raise exception 'Alleen negatieve afrekeningen kunnen via de factuurflow worden verwerkt';
  end if;
  update public.settlements s set status = 'invoice_sent', invoice_sent_at = coalesce(s.invoice_sent_at, now()), updated_at = now()
  where s.id = any(settlement_ids) and s.status = 'approved' and coalesce(s.client_payout, 0) < 0;
  get diagnostics v_sent = row_count;
  return query select v_sent;
end;
$function$;

create or replace function public.mark_settlements_invoice_paid(settlement_ids uuid[])
 returns table(paid_count integer) language plpgsql security definer set search_path to 'public'
as $function$
declare v_requested integer; v_found integer; v_paid integer;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag factuurstatussen verwerken' using errcode = '42501';
  end if;
  v_requested := coalesce(cardinality(settlement_ids), 0);
  if v_requested = 0 then raise exception 'Geen afrekeningen geselecteerd'; end if;
  select count(*) into v_found from public.settlements s where s.id = any(settlement_ids);
  if v_found <> v_requested then raise exception 'Een of meer afrekeningen bestaan niet'; end if;
  if exists (select 1 from public.settlements s where s.id = any(settlement_ids) and s.status <> 'invoice_sent') then
    raise exception 'Alleen open facturen kunnen als voldaan worden gemarkeerd';
  end if;
  update public.settlements s set status = 'invoice_paid', paid_at = now(), updated_at = now()
  where s.id = any(settlement_ids) and s.status = 'invoice_sent';
  get diagnostics v_paid = row_count;
  return query select v_paid;
end;
$function$;

create or replace function public.set_settlement_fee_waived(p_settlement_id uuid, p_waived boolean)
 returns table(id uuid, fee_waived boolean, echarging_fee_per_kwh numeric, echarging_revenue numeric, client_payout numeric)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_status text; v_client_id uuid; v_rate numeric;
begin
  if not (app_private.has_role(auth.uid(), 'admin'::public.app_role)
       or app_private.has_role(auth.uid(), 'manager'::public.app_role)) then
    raise exception 'Alleen admin/manager mag de service-fee kwijtschelden' using errcode = '42501';
  end if;
  select s.status, s.client_id into v_status, v_client_id from public.settlements s where s.id = p_settlement_id for update;
  if v_status is null then raise exception 'Afrekening bestaat niet'; end if;
  if v_status not in ('live', 'calculated') then
    raise exception 'Alleen lopende of berekende maanden kunnen worden kwijtgescholden (status: %)', v_status;
  end if;
  if p_waived then
    update public.settlements s
    set fee_waived = true, echarging_fee_per_kwh = 0, echarging_revenue = 0, client_payout = s.gross_revenue, updated_at = now()
    where s.id = p_settlement_id;
  else
    -- Herstel: tarief opnieuw afleiden (per-klant override → org-default → 0.10), identiek aan aggregate-settlements.
    select coalesce(c.echarging_fee_per_kwh,
             (select o.default_echarging_fee_per_kwh from public.organizations o order by o.created_at limit 1), 0.10)
      into v_rate from public.clients c where c.id = v_client_id;
    v_rate := coalesce(v_rate, 0.10);
    update public.settlements s
    set fee_waived = false, echarging_fee_per_kwh = v_rate, echarging_revenue = v_rate * s.total_kwh,
        client_payout = s.gross_revenue - (v_rate * s.total_kwh), updated_at = now()
    where s.id = p_settlement_id;
  end if;
  return query select s.id, s.fee_waived, s.echarging_fee_per_kwh, s.echarging_revenue, s.client_payout
  from public.settlements s where s.id = p_settlement_id;
end;
$function$;

-- ---- Grants (gelijk aan live; SECURITY DEFINER + interne role-check) ----------
do $$
declare fn text;
begin
  foreach fn in array array[
    'approve_settlements(uuid[])','unapprove_settlements(uuid[])',
    'mark_settlements_eflux_reimbursed(uuid[])','mark_settlements_paid(uuid[])',
    'mark_settlements_invoice_sent(uuid[])','mark_settlements_invoice_paid(uuid[])',
    'set_settlement_fee_waived(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public;', fn);
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
  revoke all on function public.next_settlement_invoice_number() from public;
  grant execute on function public.next_settlement_invoice_number() to service_role;
end $$;

-- ---- pg_cron (geld-pijplijn) — DOCUMENTATIE, niet uitvoeren op de live DB ------
-- De live jobs zijn NAAMLOOS (jobid 1/2/3); ze hier opnieuw aanmaken met cron.schedule
-- zou ze DUBBELEN. Voor een VERSE DB: voer onderstaande named-schedules eenmalig uit.
--   select cron.schedule('eflux-sync',           '*/30 * * * *', $$ select public.invoke_edge_function('eflux-sync', '{}'::jsonb); $$);
--   select cron.schedule('aggregate-settlements', '0 2 * * *',    $$ select public.invoke_edge_function('aggregate-settlements', '{}'::jsonb); $$);
--   select cron.schedule('quote-opd-sync',        '7 * * * *',    $$ select public.invoke_edge_function('quote-opd-sync', '{}'::jsonb); $$);
