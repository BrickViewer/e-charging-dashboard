-- Objecten-module: promoveer project_locations tot eersteklas entiteit met
-- genormaliseerde adres-matching (e-portal-stijl) + duplicaat-detectie via RPC.

alter table public.project_locations
  add column if not exists normalized_postal text
    generated always as (upper(regexp_replace(coalesce(postal_code,''), '\s', '', 'g'))) stored;
alter table public.project_locations
  add column if not exists normalized_street text
    generated always as (lower(regexp_replace(btrim(coalesce(address_street,'')), '\s+', ' ', 'g'))) stored;
alter table public.project_locations add column if not exists house_number text;
alter table public.project_locations add column if not exists status text not null default 'actief';
alter table public.project_locations add column if not exists notes text;

create index if not exists project_locations_norm_postal_idx on public.project_locations(organization_id, normalized_postal);
create index if not exists project_locations_norm_street_idx on public.project_locations(organization_id, normalized_street);

-- Beste-match-eerst object-matching op genormaliseerd adres. Service-role (edge fns) én
-- interne gebruikers (de ObjectPicker) mogen 'm aanroepen; portal-klanten niet.
create or replace function public.find_matching_project_location(
  p_org uuid, p_company uuid, p_street text, p_postal text, p_city text default null, p_house text default null
)
returns setof public.project_locations
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  -- security definer omzeilt RLS → blokkeer niet-interne (portal) callers. service_role = auth.uid() null.
  if auth.uid() is not null and not app_private.is_internal(auth.uid()) then
    return;
  end if;

  return query
  with i as (
    select
      upper(regexp_replace(coalesce(p_postal,''), '\s', '', 'g')) as npostal,
      lower(regexp_replace(btrim(coalesce(p_street,'')), '\s+', ' ', 'g')) as nstreet,
      lower(btrim(coalesce(p_city,''))) as ncity,
      nullif(lower(btrim(coalesce(p_house,''))), '') as nhouse
  )
  select pl.*
  from public.project_locations pl, i
  where pl.organization_id = p_org
    and ((p_company is not null and pl.company_id = p_company) or (p_company is null and pl.company_id is null))
    and (
      (i.npostal <> '' and left(pl.normalized_postal, 4) = left(i.npostal, 4)
        and i.nhouse is not null and lower(coalesce(pl.house_number,'')) = i.nhouse)
      or (i.npostal <> '' and left(pl.normalized_postal, 4) = left(i.npostal, 4)
        and pl.normalized_street <> '' and pl.normalized_street = i.nstreet)
      or (pl.normalized_street <> '' and pl.normalized_street = i.nstreet
        and i.ncity <> '' and lower(btrim(coalesce(pl.city,''))) = i.ncity)
    )
  order by
    (case
      when i.npostal <> '' and pl.normalized_postal = i.npostal
        and i.nhouse is not null and lower(coalesce(pl.house_number,'')) = i.nhouse then 1
      when i.npostal <> '' and left(pl.normalized_postal,4) = left(i.npostal,4) and pl.normalized_street = i.nstreet then 2
      else 3
    end),
    pl.location_number
  limit 1;
end;
$function$;

revoke all on function public.find_matching_project_location(uuid, uuid, text, text, text, text) from public;
grant execute on function public.find_matching_project_location(uuid, uuid, text, text, text, text) to authenticated, service_role;
