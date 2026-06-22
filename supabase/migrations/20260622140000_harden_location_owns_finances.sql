-- Advisor-hardening voor de location-ownership wijzigingen.
-- 1) search_path vastzetten op de pin-triggerfunctie (lint 0011_function_search_path_mutable).
create or replace function app_private.pin_session_client_ownership()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.client_id is distinct from old.client_id
     and coalesce(current_setting('app.allow_location_client_change', true), '') <> 'on' then
    new.client_id := old.client_id;
  end if;
  return new;
end;
$$;

-- 2) set_location_client (SECURITY DEFINER) niet door anon aanroepbaar maken
--    (lint 0028_anon_security_definer_function_executable). Interne check eist al admin/manager,
--    maar we beperken de EXECUTE-grant tot ingelogde gebruikers + service_role.
revoke execute on function public.set_location_client(uuid, uuid) from public, anon;
grant execute on function public.set_location_client(uuid, uuid) to authenticated, service_role;
