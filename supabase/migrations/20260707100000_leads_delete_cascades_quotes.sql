-- Een lead verwijderen moet praktisch blijven: eerder vandaag zette 20260706190000 de FK
-- quotes.lead_id op RESTRICT (tegen wees-offertes), maar daardoor werd vrijwel elke lead
-- onverwijderbaar (bijna elke lead heeft een offerte). Nieuwe balans:
--   * FK → ON DELETE CASCADE: een lead verwijderen ruimt zijn offertes mee op (geen wees →
--     de pipeline-invariant blijft heel: een verwijderde offerte staat nergens meer).
--   * BEFORE DELETE-trigger blokkeert het verwijderen als er een GETEKENDE of naar een klant
--     omgezette offerte hangt — dat is echte omzet/historie; die handel je af via het
--     klantdossier (erase_client_for_privacy), niet door de lead te wissen.

alter table public.quotes drop constraint if exists quotes_lead_id_fkey;
alter table public.quotes
  add constraint quotes_lead_id_fkey foreign key (lead_id)
  references public.leads(id) on delete cascade;

create or replace function app_private.tg_leads_block_delete_with_signed_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.quotes q
    where q.lead_id = old.id
      and (q.status = 'getekend' or q.client_id is not null)
  ) then
    raise exception 'Deze lead heeft een getekende offerte (een echte deal) en kan niet worden verwijderd. Handel dit af via het klantdossier.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists leads_block_delete_with_signed_quote on public.leads;
create trigger leads_block_delete_with_signed_quote
  before delete on public.leads
  for each row execute function app_private.tg_leads_block_delete_with_signed_quote();
