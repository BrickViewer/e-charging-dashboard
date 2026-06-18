-- SharePoint-koppeling: offerte-dossiers (project_locations) + Microsoft Graph config.
-- Het dossier staat los van de charge-point `locations` (die vereisen een klant);
-- een dossier bestaat al bij de eerste verzending van een offerte.

create schema if not exists app_private;

-- 1. Org-config (public, non-secret; secrets staan in edge-env / Vault)
alter table public.organizations
  add column if not exists sharepoint_site_url     text,
  add column if not exists sharepoint_site_id      text,
  add column if not exists sharepoint_drive_id     text,
  add column if not exists sharepoint_root_item_id text;

-- 2. Locatienummer-sequence (globaal vanaf 201)
create sequence if not exists public.project_location_number_seq
  as integer start with 201 increment by 1 no minvalue no maxvalue cache 1;

-- 3. Dossier-tabel
create table if not exists public.project_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_number integer not null unique,
  display_name text not null,
  descriptive_label text,
  address_street text,
  postal_code text,
  city text,
  company_id uuid references public.companies(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  folder_item_id text,
  folder_web_url text,
  opdracht_item_id text,
  doc_seq integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_locations_company_idx on public.project_locations(company_id);
create index if not exists project_locations_client_idx on public.project_locations(client_id);
create index if not exists project_locations_lead_idx on public.project_locations(lead_id);

-- 4. Locatienummer-toekenning (botsing-veilig; kopie van app_private.assign_client_number)
create or replace function app_private.assign_project_location_number()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_next integer;
begin
  if new.location_number is null then
    loop
      v_next := nextval('public.project_location_number_seq');
      exit when not exists (select 1 from public.project_locations where location_number = v_next);
    end loop;
    new.location_number := v_next;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_project_location_number_before_insert on public.project_locations;
create trigger assign_project_location_number_before_insert
  before insert on public.project_locations
  for each row execute function app_private.assign_project_location_number();

-- 5. quotes: koppeling naar dossier + documentnummer + SharePoint-referenties
alter table public.quotes
  add column if not exists project_location_id uuid references public.project_locations(id) on delete set null,
  add column if not exists document_number integer,
  add column if not exists off_item_id text,
  add column if not exists off_web_url text,
  add column if not exists opd_item_id text,
  add column if not exists opd_web_url text;

-- 6. Atomaire per-locatie documentnummer-toekenning (rij-lock; geen race)
create or replace function public.assign_document_number(p_location_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.project_locations
  set doc_seq = doc_seq + 1, updated_at = now()
  where id = p_location_id
  returning doc_seq;
$$;
revoke all on function public.assign_document_number(uuid) from public;
revoke all on function public.assign_document_number(uuid) from anon;
revoke all on function public.assign_document_number(uuid) from authenticated;
grant execute on function public.assign_document_number(uuid) to service_role;

-- 7. RLS (intern lezen; sales/admin/manager beheren). Edge functions gebruiken service-role.
alter table public.project_locations enable row level security;
drop policy if exists "Internal can view project_locations" on public.project_locations;
create policy "Internal can view project_locations" on public.project_locations
  for select to authenticated using (app_private.is_internal(auth.uid()));
drop policy if exists "Sales can manage project_locations" on public.project_locations;
create policy "Sales can manage project_locations" on public.project_locations
  for all to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'))
  with check (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));

-- 8. Supabase-opslag van offerte-PDF's vervalt (alleen SharePoint). quote-accept
-- schrijft niet meer naar de 'quote-documents'-bucket. De (lege) bucket zelf laten
-- we staan: Supabase blokkeert het verwijderen van storage-buckets via SQL.
