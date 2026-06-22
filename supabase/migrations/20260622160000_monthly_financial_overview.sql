-- CFO-reconciliatie: per (year,month) tie-out eFlux-vergoeding ↔ sessie-omzet ↔ uitbetalingen.
-- Admin-only (spiegelt de eflux_invoices-RLS, NIET is_internal). SECURITY DEFINER.
-- Bucketing via app_private.session_period (Amsterdam) = identiek aan aggregate-settlements.
-- Settlement-math blijft ongewijzigd; deze functie LEEST alleen + aggregeert.

-- Groei-index: volledige sessie-scan per Amsterdam-maand (incl. geparkeerde/eigenaarloze sessies).
create index if not exists idx_sessions_started_active
  on public.charging_sessions(started_at) where excluded = false;

create or replace function public.monthly_financial_overview(p_year integer default null)
returns table (
  year                integer,
  month               integer,
  eflux_credit_incl   numeric,
  eflux_credit_excl   numeric,
  eflux_usage_incl    numeric,
  eflux_net_incl      numeric,
  sessions_reimb_excl numeric,
  sessions_reimb_incl numeric,
  sessions_kwh        numeric,
  sessions_count      integer,
  recon_diff_incl     numeric,
  tie_out_ok          boolean,
  gross_total         numeric,
  payout_total        numeric,
  fee_total           numeric,
  assigned_reimb      numeric,
  unassigned_reimb    numeric,
  cnt_live            integer,
  cnt_calculated      integer,
  cnt_approved        integer,
  cnt_paid            integer,
  cnt_invoice_sent    integer,
  cnt_invoice_paid    integer,
  cnt_charged_back    integer,
  settlements_total   integer,
  settlements_final   integer,
  recon_status        text
)
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_cur_year  integer;
  v_cur_month integer;
begin
  if not app_private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Alleen admins mogen de financiële reconciliatie opvragen' using errcode = '42501';
  end if;

  select extract(year  from (now() at time zone 'Europe/Amsterdam'))::int,
         extract(month from (now() at time zone 'Europe/Amsterdam'))::int
    into v_cur_year, v_cur_month;

  return query
  with
  sess as (
    select sp.yr as y, sp.mo as m,
           sum(cs.reimbursement_amount)::numeric as reimb_excl,
           sum(cs.kwh_delivered)::numeric        as kwh,
           count(*)::int                          as cnt
    from public.charging_sessions cs
    cross join lateral app_private.session_period(cs.started_at) sp
    where cs.excluded = false
    group by sp.yr, sp.mo
  ),
  inv as (
    select ei.year as y, ei.month as m,
           sum(case when ei.type = 'cpo-credit' then ei.total_credit_amount_with_vat else 0 end)::numeric as credit_incl,
           sum(case when ei.type = 'cpo-usage'  then ei.total_amount_with_vat        else 0 end)::numeric as usage_incl,
           bool_or(ei.type = 'cpo-credit') as has_credit
    from public.eflux_invoices ei
    where ei.year is not null and ei.month is not null
    group by ei.year, ei.month
  ),
  setl as (
    select s.year as y, s.month as m,
           sum(s.gross_revenue)::numeric     as gross_total,
           sum(s.client_payout)::numeric     as payout_total,
           sum(s.echarging_revenue)::numeric as fee_total,
           count(*)::int                                                                 as total,
           count(*) filter (where s.status = 'live')::int                                as c_live,
           count(*) filter (where s.status = 'calculated')::int                          as c_calc,
           count(*) filter (where s.status = 'approved')::int                            as c_appr,
           count(*) filter (where s.status = 'paid')::int                                as c_paid,
           count(*) filter (where s.status = 'invoice_sent')::int                        as c_isent,
           count(*) filter (where s.status = 'invoice_paid')::int                        as c_ipaid,
           count(*) filter (where s.status = 'charged_back')::int                        as c_cb,
           count(*) filter (where s.status = any(array[
             'approved','paid','invoice_sent','invoice_paid','charged_back']))::int       as c_final
    from public.settlements s
    group by s.year, s.month
  ),
  months as (
    select y, m from sess
    union select y, m from inv
    union select y, m from setl
  )
  select
    mo.y, mo.m,
    coalesce(inv.credit_incl, 0)                                  as eflux_credit_incl,
    round(coalesce(inv.credit_incl, 0) / 1.21, 2)                 as eflux_credit_excl,
    coalesce(inv.usage_incl, 0)                                   as eflux_usage_incl,
    coalesce(inv.credit_incl, 0) - coalesce(inv.usage_incl, 0)   as eflux_net_incl,
    round(coalesce(sess.reimb_excl, 0), 2)                        as sessions_reimb_excl,
    round(coalesce(sess.reimb_excl, 0) * 1.21, 2)                 as sessions_reimb_incl,
    coalesce(sess.kwh, 0)                                         as sessions_kwh,
    coalesce(sess.cnt, 0)                                         as sessions_count,
    round(coalesce(sess.reimb_excl,0) * 1.21, 2) - coalesce(inv.credit_incl, 0) as recon_diff_incl,
    (inv.has_credit is true
       and abs(round(coalesce(sess.reimb_excl,0)*1.21,2) - coalesce(inv.credit_incl,0)) < 0.01) as tie_out_ok,
    coalesce(setl.gross_total, 0)                                 as gross_total,
    coalesce(setl.payout_total, 0)                                as payout_total,
    coalesce(setl.fee_total, 0)                                   as fee_total,
    coalesce(setl.gross_total, 0)                                 as assigned_reimb,
    round(coalesce(sess.reimb_excl, 0), 2) - coalesce(setl.gross_total, 0) as unassigned_reimb,
    coalesce(setl.c_live,0), coalesce(setl.c_calc,0), coalesce(setl.c_appr,0),
    coalesce(setl.c_paid,0), coalesce(setl.c_isent,0), coalesce(setl.c_ipaid,0),
    coalesce(setl.c_cb,0),
    coalesce(setl.total,0)                                        as settlements_total,
    coalesce(setl.c_final,0)                                      as settlements_final,
    case
      when (mo.y > v_cur_year or (mo.y = v_cur_year and mo.m >= v_cur_month))
           and inv.has_credit is not true                       then 'lopend'
      when inv.has_credit is not true                           then 'geen_factuur'
      when abs(round(coalesce(sess.reimb_excl,0)*1.21,2) - coalesce(inv.credit_incl,0)) < 0.01
                                                                then 'sluit'
      else 'verschil'
    end as recon_status
  from months mo
  left join sess on sess.y = mo.y and sess.m = mo.m
  left join inv  on inv.y  = mo.y and inv.m  = mo.m
  left join setl on setl.y = mo.y and setl.m = mo.m
  where (p_year is null or mo.y = p_year)
  order by mo.y desc, mo.m desc;
end;
$$;

revoke all on function public.monthly_financial_overview(integer) from public;
grant execute on function public.monthly_financial_overview(integer) to authenticated;
