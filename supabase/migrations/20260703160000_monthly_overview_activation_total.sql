-- Informatieve uitbreiding van de CFO-reconciliatie: exposeer per maand de som van de
-- verrekende activatiekosten (activation_total) los náást payout_total. payout_total blijft
-- BRUTO — de eFlux tie-out (eflux_credit ≈ payout + fee) rekent op bruto, dus niet netten.
-- Adding a column to RETURNS TABLE requires DROP + recreate (return type change).
-- SECURITY DEFINER + search_path + admin has_role guard blijven ongewijzigd; grants worden
-- na de recreate exact hersteld (mirror van de bestaande proacl).

drop function if exists public.monthly_financial_overview(integer);

create or replace function public.monthly_financial_overview(p_year integer default null::integer)
 returns table(year integer, month integer, eflux_credit_incl numeric, eflux_credit_excl numeric, eflux_usage_incl numeric, eflux_net_incl numeric, sessions_reimb_excl numeric, sessions_reimb_incl numeric, sessions_kwh numeric, sessions_count integer, recon_diff_incl numeric, tie_out_ok boolean, gross_total numeric, payout_total numeric, fee_total numeric, assigned_reimb numeric, unassigned_reimb numeric, cnt_live integer, cnt_calculated integer, cnt_approved integer, cnt_paid integer, cnt_invoice_sent integer, cnt_invoice_paid integer, cnt_charged_back integer, settlements_total integer, settlements_final integer, recon_status text, activation_total numeric)
 language plpgsql
 security definer
 set search_path to 'public', 'app_private'
as $function$
declare v_cur_year integer; v_cur_month integer;
begin
  if not app_private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Alleen admins mogen de financiële reconciliatie opvragen' using errcode = '42501';
  end if;
  select extract(year from (now() at time zone 'Europe/Amsterdam'))::int,
         extract(month from (now() at time zone 'Europe/Amsterdam'))::int
    into v_cur_year, v_cur_month;
  return query
  with
  sess as (
    select sp.yr as y, sp.mo as m, sum(cs.reimbursement_amount)::numeric as reimb_excl,
           sum(cs.kwh_delivered)::numeric as kwh, count(*)::int as cnt
    from public.charging_sessions cs
    cross join lateral app_private.session_period(cs.started_at) sp
    where cs.excluded = false group by sp.yr, sp.mo
  ),
  inv as (
    select ei.year as y, ei.month as m,
           sum(case when ei.type = 'cpo-credit' then ei.total_credit_amount_with_vat else 0 end)::numeric as credit_incl,
           sum(case when ei.type = 'cpo-usage'  then ei.total_amount_with_vat        else 0 end)::numeric as usage_incl,
           bool_or(ei.type = 'cpo-credit') as has_credit
    from public.eflux_invoices ei where ei.year is not null and ei.month is not null group by ei.year, ei.month
  ),
  setl as (
    select s.year as y, s.month as m, sum(s.gross_revenue)::numeric as gross_total,
           sum(s.client_payout)::numeric as payout_total, sum(s.echarging_revenue)::numeric as fee_total,
           sum(coalesce(s.activation_cost,0))::numeric as activation_total,
           count(*)::int as total,
           count(*) filter (where s.status='live')::int as c_live,
           count(*) filter (where s.status='calculated')::int as c_calc,
           count(*) filter (where s.status='approved')::int as c_appr,
           count(*) filter (where s.status='paid')::int as c_paid,
           count(*) filter (where s.status='invoice_sent')::int as c_isent,
           count(*) filter (where s.status='invoice_paid')::int as c_ipaid,
           count(*) filter (where s.status='charged_back')::int as c_cb,
           count(*) filter (where s.status=any(array['approved','paid','invoice_sent','invoice_paid','charged_back']))::int as c_final
    from public.settlements s group by s.year, s.month
  ),
  months as ( select y,m from sess union select y,m from inv union select y,m from setl )
  select mo.y, mo.m,
    coalesce(inv.credit_incl,0), round(coalesce(inv.credit_incl,0)/1.21,2), coalesce(inv.usage_incl,0),
    coalesce(inv.credit_incl,0)-coalesce(inv.usage_incl,0),
    round(coalesce(sess.reimb_excl,0),2), round(coalesce(sess.reimb_excl,0)*1.21,2),
    coalesce(sess.kwh,0), coalesce(sess.cnt,0),
    round(coalesce(sess.reimb_excl,0)*1.21,2)-coalesce(inv.credit_incl,0),
    (inv.has_credit is true and abs(round(coalesce(sess.reimb_excl,0)*1.21,2)-coalesce(inv.credit_incl,0))<0.01),
    coalesce(setl.gross_total,0), coalesce(setl.payout_total,0), coalesce(setl.fee_total,0),
    coalesce(setl.gross_total,0), round(coalesce(sess.reimb_excl,0),2)-coalesce(setl.gross_total,0),
    coalesce(setl.c_live,0), coalesce(setl.c_calc,0), coalesce(setl.c_appr,0), coalesce(setl.c_paid,0),
    coalesce(setl.c_isent,0), coalesce(setl.c_ipaid,0), coalesce(setl.c_cb,0),
    coalesce(setl.total,0), coalesce(setl.c_final,0),
    case
      when (mo.y>v_cur_year or (mo.y=v_cur_year and mo.m>=v_cur_month)) and inv.has_credit is not true then 'lopend'
      when inv.has_credit is not true then 'geen_factuur'
      when abs(round(coalesce(sess.reimb_excl,0)*1.21,2)-coalesce(inv.credit_incl,0))<0.01 then 'sluit'
      else 'verschil'
    end,
    coalesce(setl.activation_total,0)
  from months mo
  left join sess on sess.y=mo.y and sess.m=mo.m
  left join inv  on inv.y =mo.y and inv.m =mo.m
  left join setl on setl.y=mo.y and setl.m=mo.m
  where (p_year is null or mo.y=p_year)
  order by mo.y desc, mo.m desc;
end;
$function$;

-- Grants exact herstellen (mirror van bestaande proacl: authenticated + service_role EXECUTE,
-- owner-execute impliciet; PUBLIC bewust géén execute — de admin has_role guard beschermt runtime).
revoke all on function public.monthly_financial_overview(integer) from public;
grant execute on function public.monthly_financial_overview(integer) to authenticated;
grant execute on function public.monthly_financial_overview(integer) to service_role;
