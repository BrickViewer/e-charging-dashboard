-- Lijst-view voor server-side filteren/sorteren/pagineren. security_invoker => de
-- bestaande leads-RLS geldt. lifecycle leidt de levenscyclus af uit status +
-- facturatie (installation_orders.invoiced_at), zonder nieuwe status/archief-kolom:
--   open        = status 'open'
--   won_active  = gewonnen, maar er is nog een openstaande (niet-gefactureerde) order  -> "Gewonnen (loopt)"
--   invoiced    = gewonnen en gefactureerd (of gewonnen zonder openstaande order)      -> "Gefactureerd/gesloten"
--   lost        = status 'lost'
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
        when exists (
          select 1 from public.installation_orders io
          where io.lead_id = l.id and io.invoiced_at is null and io.status <> 'geannuleerd'
        ) then 'won_active'
        else 'invoiced'
      end
    else 'open'
  end as lifecycle
from public.leads l;
