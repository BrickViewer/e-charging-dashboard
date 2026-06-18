-- Objectnummering: ken het LAAGSTE VRIJE nummer >= 201 toe (i.p.v. een doortellende
-- sequence). Verwijder je 203, dan krijgt het volgende nieuwe object weer 203.
-- Race-veilig via een advisory xact-lock (serialiseert gelijktijdige inserts).
create or replace function app_private.assign_project_location_number()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $function$
declare
  v_next integer;
begin
  if new.location_number is null then
    perform pg_advisory_xact_lock(hashtext('project_location_number'));
    select coalesce(min(g.n), 201) into v_next
    from generate_series(201, coalesce((select max(location_number) from public.project_locations), 200) + 1) as g(n)
    where not exists (select 1 from public.project_locations where location_number = g.n);
    new.location_number := v_next;
  end if;
  return new;
end;
$function$;
