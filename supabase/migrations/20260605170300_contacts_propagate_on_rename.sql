-- Bron-van-waarheid: wijzig je een bedrijf/persoon, dan propageert dat naar de
-- inline cache van alle gekoppelde leads/clients/quotes.

create or replace function public.tg_companies_propagate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.leads   set company_name = new.name where company_id = new.id and company_name is distinct from new.name;
    update public.clients set company_name = new.name where company_id = new.id and company_name is distinct from new.name;
    update public.quotes  set prospect_company = new.name where company_id = new.id and prospect_company is distinct from new.name;
  end if;
  return null;
end $$;
drop trigger if exists companies_propagate on public.companies;
create trigger companies_propagate after update on public.companies
  for each row execute function public.tg_companies_propagate();

create or replace function public.tg_persons_propagate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name
     or new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.role is distinct from old.role then
    update public.leads   set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone, contact_role = new.role where person_id = new.id;
    update public.clients set contact_name = nullif(new.full_name,''), contact_email = new.email, contact_phone = new.phone where person_id = new.id;
    update public.quotes  set prospect_contact = nullif(new.full_name,''), prospect_email = new.email where person_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists persons_propagate on public.persons;
create trigger persons_propagate after update on public.persons
  for each row execute function public.tg_persons_propagate();
