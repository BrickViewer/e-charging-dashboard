-- Contactenmodule-upgrade: objecten koppelbaar aan personen, harde e-mail-dedup op
-- personen, en een goedkope reverse-lookup van klant naar herkomst-lead(s).

-- 1) Object <-> persoon: losse FK-kolom, consistent met de bestaande
--    company_id / lead_id / client_id op project_locations (allemaal on delete set null).
alter table public.project_locations
  add column if not exists person_id uuid references public.persons(id) on delete set null;
create index if not exists project_locations_person_idx on public.project_locations(person_id);

-- 2) Eén e-mail = één persoon per organisatie. Partial unique index (negeert lege e-mails)
--    in lijn met het bestaande clients_one_active_account_per_company-idioom. De live data
--    is geverifieerd zonder dubbele e-mails, dus dit kan zonder merge.
create unique index if not exists persons_org_email_unique
  on public.persons (organization_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

-- 3) Reverse-lookup klant -> herkomst-lead(s): leads.converted_client_id wordt al gezet bij
--    conversie; deze index maakt "welke lead(s) hoorden bij deze klant" goedkoop.
create index if not exists leads_converted_client_idx on public.leads(converted_client_id);
