-- Canonieke objectnaam: project_locations.display_name wordt altijd afgeleid uit
-- adres + objectnummer («straat» «huisnr», «plaats» («nr»)) i.p.v. een vrij tekstveld.
-- Zelfhelend bij adreswijziging; de SharePoint-map gebruikt voortaan deze ene naam.

create or replace function app_private.build_object_label(street text, house text, city text, nr integer)
returns text
language sql
immutable
set search_path = ''
as $$
  with x as (
    select
      regexp_replace(btrim(coalesce(street,'') || ' ' || coalesce(house,'')), '\s+', ' ', 'g') as sp,
      btrim(coalesce(city,'')) as c
  )
  select (
    case
      when sp = '' and c = '' then 'Object'
      when sp = ''            then c
      when c  = ''            then sp
      else sp || ', ' || c
    end
  ) || ' (' || coalesce(nr, 0) || ')'
  from x
$$;

create or replace function app_private.set_project_location_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := app_private.build_object_label(
    new.address_street, new.house_number, new.city, new.location_number);
  return new;
end;
$$;

-- zz_-prefix zodat deze trigger ná de location_number-gapfill
-- (assign_project_location_number_before_insert) draait: nummer is dan gezet.
drop trigger if exists zz_project_location_display_name on public.project_locations;
create trigger zz_project_location_display_name
  before insert or update on public.project_locations
  for each row execute function app_private.set_project_location_display_name();

-- Backfill: alle bestaande objecten naar de canonieke naam.
update public.project_locations
  set display_name = app_private.build_object_label(address_street, house_number, city, location_number);
