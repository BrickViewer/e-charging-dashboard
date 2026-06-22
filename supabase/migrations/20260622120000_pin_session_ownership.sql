-- Eigendom van een bestaande sessie mag ALLEEN via de transfer-primitive wijzigen.
-- eflux-sync upsert zet client_id = location.client_id bij elke re-sync; zonder deze pin zou een
-- her-uitgegeven (afgerekende of overgedragen) sessie stilletjes van eigenaar wisselen. De pin
-- herstelt client_id naar de oude waarde tenzij de transfer-guard (app.allow_location_client_change)
-- aan staat — die zetten park_location/set_location_client zelf. INSERTs raakt dit niet.
create or replace function app_private.pin_session_client_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.client_id is distinct from old.client_id
     and coalesce(current_setting('app.allow_location_client_change', true), '') <> 'on' then
    new.client_id := old.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pin_session_client_ownership on public.charging_sessions;
create trigger trg_pin_session_client_ownership
  before update on public.charging_sessions
  for each row execute function app_private.pin_session_client_ownership();
