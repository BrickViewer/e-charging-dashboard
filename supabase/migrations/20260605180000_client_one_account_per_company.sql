-- 1 bedrijf = 1 klantaccount: maximaal één niet-verwijderde klant per bedrijf.
-- Erased clients (status 'verwijderd') zijn uitgesloten, dus geen conflict.
create unique index if not exists clients_one_active_account_per_company
  on public.clients(company_id)
  where company_id is not null and coalesce(status, 'actief') <> 'verwijderd';

-- Helper: het bestaande niet-verwijderde klant-id voor een bedrijf (of null).
create or replace function app_private.active_client_for_company(p_org uuid, p_company uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clients
  where organization_id = p_org
    and company_id = p_company
    and coalesce(status, 'actief') <> 'verwijderd'
  order by created_at asc
  limit 1;
$$;
