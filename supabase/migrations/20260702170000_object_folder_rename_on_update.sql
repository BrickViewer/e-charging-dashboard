-- SharePoint-map hernoemen bij adres-/naamwijziging: object-ensure-folder ook op UPDATE
-- aanroepen, maar alleen als adres of display_name wijzigt (voorkomt een loop op de
-- folder-veld-updates die de edge zelf schrijft).
create or replace function public.tg_project_location_ensure_folder()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and not (
       new.address_street is distinct from old.address_street
    or new.house_number   is distinct from old.house_number
    or new.postal_code    is distinct from old.postal_code
    or new.city           is distinct from old.city
    or new.display_name   is distinct from old.display_name
  ) then
    return null;
  end if;
  if exists (
    select 1 from public.organizations
    where id = new.organization_id and sharepoint_drive_id is not null
  ) then
    perform public.invoke_edge_function('object-ensure-folder', jsonb_build_object('object_id', new.id));
  end if;
  return null;
end;
$function$;

drop trigger if exists project_location_ensure_folder on public.project_locations;
create trigger project_location_ensure_folder
  after insert or update on public.project_locations
  for each row execute function public.tg_project_location_ensure_folder();
