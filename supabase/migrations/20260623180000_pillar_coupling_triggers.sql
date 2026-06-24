-- Pijler-koppelingen unificeren + opruimen.
-- 1) company_persons (M:N) ALTIJD vullen zodra een rij company_id+person_id heeft (ongeacht pad).
-- 2) Objecten van een lead aan de klant koppelen zodra de lead converteert (geen object-wees).
-- 3) Dode FK leads.quote_id droppen (quotes.lead_id is de bron). Terugdraaien: kolom her-toevoegen.

-- 1) Eén mechanisme voor de M:N company<->person -----------------------------
create or replace function public.tg_link_company_person()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.company_id is not null and new.person_id is not null
     and (tg_op = 'INSERT'
          or new.company_id is distinct from old.company_id
          or new.person_id is distinct from old.person_id) then
    insert into public.company_persons (company_id, person_id)
    values (new.company_id, new.person_id)
    on conflict (company_id, person_id) do nothing;
  end if;
  return null;
end $function$;

drop trigger if exists leads_link_company_person on public.leads;
create trigger leads_link_company_person after insert or update on public.leads
  for each row execute function public.tg_link_company_person();
drop trigger if exists clients_link_company_person on public.clients;
create trigger clients_link_company_person after insert or update on public.clients
  for each row execute function public.tg_link_company_person();
drop trigger if exists quotes_link_company_person on public.quotes;
create trigger quotes_link_company_person after insert or update on public.quotes
  for each row execute function public.tg_link_company_person();
drop trigger if exists project_locations_link_company_person on public.project_locations;
create trigger project_locations_link_company_person after insert or update on public.project_locations
  for each row execute function public.tg_link_company_person();

-- 2) Lead converteert -> koppel de (nog niet gekoppelde) objecten van de lead aan de klant.
create or replace function public.tg_lead_link_objects_to_client()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.converted_client_id is not null
     and (tg_op = 'INSERT' or new.converted_client_id is distinct from old.converted_client_id) then
    update public.project_locations
      set client_id = new.converted_client_id
      where lead_id = new.id and client_id is null;
  end if;
  return null;
end $function$;

drop trigger if exists lead_link_objects_to_client on public.leads;
create trigger lead_link_objects_to_client after insert or update on public.leads
  for each row execute function public.tg_lead_link_objects_to_client();

-- 3) Dode kolom opruimen (nergens geschreven/gelezen; quotes.lead_id is de echte 1:N-koppeling).
alter table public.leads drop column if exists quote_id;
