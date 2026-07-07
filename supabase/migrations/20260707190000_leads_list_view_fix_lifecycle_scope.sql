-- Fix: lifecycle 'invoiced' alleen bij ECHTE facturatie (is_invoiced); gewonnen zonder
-- factuur = won_active ("Gewonnen"). + scope_effective: rauwe leads.scope, anders afgeleid
-- uit de nieuwste relevante offerte (spiegelt scopeFromFlags), zodat de lijst de scope toont
-- net als het bord. Nieuwe kolom staat achteraan zodat create-or-replace lukt.
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
    (
      select case
        when (q.with_installation is not false) and (q.with_management is not false) then 'installatie_beheer'
        when (q.with_installation is not false) and (q.with_management is false) then 'alleen_installatie'
        else 'alleen_beheer'
      end
      from public.quotes q
      where q.lead_id = l.id and q.status not in ('vervangen', 'afgewezen')
      order by q.sent_at desc nulls last, q.created_at desc
      limit 1
    )
  ) as scope_effective
from public.leads l;
