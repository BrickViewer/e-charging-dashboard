-- Maanden (Amsterdam) binnen de laatste 24 mnd met niet-excluded, client-gekoppelde sessies
-- die (voor minstens één client) GEEN settlement-rij hebben. Voedt de catch-up in
-- aggregate-settlements, zodat geen maand met geldige sessies zonder settlement blijft
-- (bv. door een te smal aggregatie-venster of een (her)koppeling/park).
create or replace function public.settlement_gap_months()
returns table(year int, month int)
language sql stable security definer set search_path to 'public', 'app_private'
as $$
  select distinct sp.yr, sp.mo
  from public.charging_sessions cs
  cross join lateral app_private.session_period(cs.started_at) sp
  where cs.excluded = false
    and cs.client_id is not null
    and cs.started_at >= now() - interval '24 months'
    and not exists (
      select 1 from public.settlements s
      where s.client_id = cs.client_id and s.year = sp.yr and s.month = sp.mo
    );
$$;
revoke all on function public.settlement_gap_months() from public, anon, authenticated;
grant execute on function public.settlement_gap_months() to service_role;
