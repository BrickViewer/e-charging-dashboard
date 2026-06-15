-- ============================================================================
-- E-GROUP PORTAL — backend voor de installatie-koppeling met E-Charging
-- Project: natxaneygihzzszabmcv (E-Group Database)
-- Toegepast via Supabase MCP vanuit het E-Charging dashboard. Dit bestand is een
-- REFERENTIE-kopie (bron van waarheid is de E-Group migratiegeschiedenis).
-- ============================================================================

-- 1) Externe bron voor opdrachten (aparte transactie i.v.m. ALTER TYPE).
alter type order_source add value if not exists 'e_charging_dashboard';

-- 2) Koppelvelden op orders.
alter table public.orders add column if not exists external_reference text;
alter table public.orders add column if not exists external_system text;
alter table public.orders add column if not exists external_callback_url text;
create unique index if not exists orders_external_reference_idx
  on public.orders(external_reference) where external_reference is not null;
create index if not exists orders_external_system_idx
  on public.orders(external_system) where external_system is not null;

-- 3) Secret voor terug-callen (Vault) — waarde via vault.create_secret gezet.
--    name = 'echarging_webhook_secret'
--    Daarnaast (intake-auth): name = 'echarging_intake_secret'

-- 4) Statusterugkoppeling naar het bronsysteem via pg_net.
create or replace function public.notify_external_order_status()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_secret text;
begin
  if new.external_system is null or new.external_callback_url is null then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'echarging_webhook_secret'
  limit 1;

  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := new.external_callback_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-echarging-secret', v_secret
    ),
    body := jsonb_build_object(
      'external_reference', new.external_reference,
      'egroup_order_id', new.id,
      'egroup_order_number', new.order_number,
      'status', new.status::text,
      'completed_at', case when new.status in ('gereed','afgerond') then now() else null end
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_external_order_status on public.orders;
create trigger trg_notify_external_order_status
  after update of status on public.orders
  for each row
  when (new.external_system is not null and new.status is distinct from old.status)
  execute function public.notify_external_order_status();

-- 5) Service-role-only RPC om een integratie-secret uit de Vault te lezen
--    (gebruikt door de intake edge function als env-fallback).
create or replace function public.get_integration_secret(p_name text)
returns text
language sql
security definer
set search_path = 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
revoke all on function public.get_integration_secret(text) from public;
revoke all on function public.get_integration_secret(text) from anon;
revoke all on function public.get_integration_secret(text) from authenticated;
grant execute on function public.get_integration_secret(text) to service_role;
