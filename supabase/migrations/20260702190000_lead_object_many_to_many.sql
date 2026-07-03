-- Lead <-> object (project_locations) van 1:N naar N:M.
-- Nieuwe junctietabel is de bron van waarheid voor "welke leads horen bij een object".
-- project_locations.lead_id blijft bestaan als "oorspronkelijke/primaire lead" en wordt door
-- een mirror-trigger in de junctie gehouden, zodat alle bestaande lead_id-schrijvers (AddLeadDialog,
-- ObjectCreateDialog, resolveProjectLocation-edge, quote-create-from-lead-claim) de junctie vullen.

-- 1) Junctietabel + RLS (identiek aan project_locations).
create table if not exists public.lead_project_locations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  project_location_id uuid not null references public.project_locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, project_location_id)
);
create index if not exists lpl_lead_idx on public.lead_project_locations(lead_id);
create index if not exists lpl_object_idx on public.lead_project_locations(project_location_id);

alter table public.lead_project_locations enable row level security;

drop policy if exists "Internal can view lead_project_locations" on public.lead_project_locations;
create policy "Internal can view lead_project_locations" on public.lead_project_locations
  for select using ((select app_private.is_internal(auth.uid())));

drop policy if exists "Sales can manage lead_project_locations" on public.lead_project_locations;
create policy "Sales can manage lead_project_locations" on public.lead_project_locations
  for all
  using ((select app_private.has_role(auth.uid(), 'admin'::app_role))
      or (select app_private.has_role(auth.uid(), 'manager'::app_role))
      or (select app_private.has_role(auth.uid(), 'sales'::app_role)))
  with check ((select app_private.has_role(auth.uid(), 'admin'::app_role))
      or (select app_private.has_role(auth.uid(), 'manager'::app_role))
      or (select app_private.has_role(auth.uid(), 'sales'::app_role)));

-- 2) Backfill VOOR de triggers bestaan (zodat de junctie-adres-trigger niet op backfill vuurt).
insert into public.lead_project_locations (lead_id, project_location_id)
select lead_id, id from public.project_locations where lead_id is not null
on conflict (lead_id, project_location_id) do nothing;

-- 3) Mirror: elke keer dat project_locations.lead_id gezet wordt -> junctierij (superset = primair + gedeeld).
create or replace function public.tg_pl_lead_sync_junction()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.lead_id is not null then
    insert into public.lead_project_locations (lead_id, project_location_id)
    values (new.lead_id, new.id)
    on conflict (lead_id, project_location_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists tg_pl_lead_sync_junction on public.project_locations;
create trigger tg_pl_lead_sync_junction
  after insert or update of lead_id on public.project_locations
  for each row execute function public.tg_pl_lead_sync_junction();

-- 4) Nieuwe koppeling (lead <-> bestaand object) -> kopieer het object-adres naar die lead-cache.
create or replace function public.tg_junction_address_to_lead()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.leads l set
    address_street = pl.address_street,
    house_number   = pl.house_number,
    postal_code    = pl.postal_code,
    city           = pl.city
  from public.project_locations pl
  where pl.id = new.project_location_id and l.id = new.lead_id
    and (pl.address_street is not null or pl.house_number is not null or pl.postal_code is not null or pl.city is not null)
    and (l.address_street is distinct from pl.address_street
      or l.house_number  is distinct from pl.house_number
      or l.postal_code   is distinct from pl.postal_code
      or l.city          is distinct from pl.city);
  return null;
end $$;

drop trigger if exists tg_junction_address_to_lead on public.lead_project_locations;
create trigger tg_junction_address_to_lead
  after insert on public.lead_project_locations
  for each row execute function public.tg_junction_address_to_lead();

-- 5) Object-adres wijzigt -> duw naar ALLE gekoppelde leads (via junctie i.p.v. alleen lead_id).
--    (INSERT wordt afgehandeld door de junctie-trigger hierboven; hier vooral het UPDATE-geval.)
create or replace function public.tg_object_address_to_lead()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT'
     or new.address_street is distinct from old.address_street
     or new.house_number   is distinct from old.house_number
     or new.postal_code    is distinct from old.postal_code
     or new.city           is distinct from old.city
  then
    update public.leads l set
      address_street = new.address_street,
      house_number   = new.house_number,
      postal_code    = new.postal_code,
      city           = new.city
    from public.lead_project_locations lpl
    where lpl.project_location_id = new.id and l.id = lpl.lead_id
      and (l.address_street is distinct from new.address_street
        or l.house_number  is distinct from new.house_number
        or l.postal_code   is distinct from new.postal_code
        or l.city          is distinct from new.city);
  end if;
  return null;
end $$;

-- 6) Lead -> klant conversie: koppel ALLE objecten van de lead (via junctie) aan de klant; eerste-eigenaar-wint.
create or replace function public.tg_lead_link_objects_to_client()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.converted_client_id is not null
     and (tg_op = 'INSERT' or new.converted_client_id is distinct from old.converted_client_id) then
    update public.project_locations
      set client_id = new.converted_client_id
      where id in (select project_location_id from public.lead_project_locations where lead_id = new.id)
        and client_id is null;
  end if;
  return null;
end $$;
