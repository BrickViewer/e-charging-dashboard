-- Leads-pijplijn volgt de LEAD (estimated_charge_points), offerte alleen als terugval —
-- zodat het aantal palen op de lead-detail leidend is (offerte blijft onaangeroerd).
create or replace view public.leads_list_v with (security_invoker = true) as
select
  l.*,
  exists (
    select 1 from public.installation_orders io
    where io.lead_id = l.id and io.invoiced_at is not null
  ) as is_invoiced,
  exists (
    select 1 from public.installation_orders io
    where io.lead_id = l.id and io.invoiced_at is null and io.status <> 'geannuleerd'
  ) as has_open_order,
  (select max(la.created_at) from public.lead_activities la where la.lead_id = l.id) as last_activity_at,
  (select array_agg(ltl.tag_id) from public.lead_tag_links ltl where ltl.lead_id = l.id) as tag_ids,
  case
    when l.status = 'lost' then 'lost'
    when l.status = 'won' then
      case
        when exists (select 1 from public.installation_orders io where io.lead_id = l.id and io.invoiced_at is not null)
        then 'invoiced'
        else 'won_active'
      end
    else 'open'
  end as lifecycle,
  coalesce(
    l.scope,
    case
      when pq.id is null then null
      when (pq.with_installation is not false) and (pq.with_management is not false) then 'installatie_beheer'
      when (pq.with_installation is not false) and (pq.with_management is false) then 'alleen_installatie'
      else 'alleen_beheer'
    end
  ) as scope_effective,
  coalesce(l.estimated_charge_points, pq.num_charge_points) as paal_count,
  case
    when coalesce(pq.with_installation, true)
      then (coalesce(pq.total_hardware_cost, 0) + coalesce(pq.total_installation_cost, 0))
    else 0
  end as quote_value,
  case when pq.id is null then true else (pq.with_management is not false) end as mgmt_in_scope
from public.leads l
left join lateral (
  select q.id, q.num_charge_points, q.with_installation, q.with_management,
         q.total_hardware_cost, q.total_installation_cost
  from public.quotes q
  where q.lead_id = l.id and q.status not in ('vervangen', 'afgewezen')
  order by q.sent_at desc nulls last, q.created_at desc
  limit 1
) pq on true;
