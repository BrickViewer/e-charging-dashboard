-- Bij het aanmaken van een object (project_locations) ALTIJD een SharePoint-dossiermap aanmaken.
-- AFTER-INSERT-trigger roept de edge object-ensure-folder aan (async, via invoke_edge_function /
-- pg_net + internal-secret). Alleen wanneer de org SharePoint geconfigureerd heeft (anders no-op,
-- geen zinloze net-call). De edge is idempotent + graceful. Fires NIET op UPDATE → geen recursie
-- wanneer de edge folder_item_id terugschrijft.
create or replace function public.tg_project_location_ensure_folder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
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
  after insert on public.project_locations
  for each row execute function public.tg_project_location_ensure_folder();
