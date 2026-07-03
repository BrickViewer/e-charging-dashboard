-- ERE-interesse in het klantportaal.
-- Aanmelden voor ERE-certificaten kan nog niet; een klant geeft via de bestaande toggle
-- "Bereken mijn ERE's" alvast aan dat 'ie ERE wil. Bij zo'n opt-in door de klant zelf krijgt het team
-- een seintje (mail-edge + taak) en houden we de aanvraag bij tot een medewerker 'm als geregeld markeert.
-- Spiegelt het BTW-bevestigingspatroon (vat_status_confirmed_at/_by + confirm_client_vat_status).

alter table public.clients
  add column if not exists ere_requested_at timestamptz,
  add column if not exists ere_arranged_at  timestamptz,
  add column if not exists ere_arranged_by  uuid;

comment on column public.clients.ere_requested_at is 'Wanneer de klant in het portaal ERE aanzette (opt-in). Null = niet aangevraagd.';
comment on column public.clients.ere_arranged_at  is 'Wanneer een medewerker de ERE-aanvraag als geregeld markeerde.';
comment on column public.clients.ere_arranged_by  is 'Medewerker die de ERE-aanvraag afrondde (auth.uid).';

-- BEFORE: stempel de aanvraag op de rij zelf. Alleen bij een klant-opt-in in het portaal
-- (auth.uid() = portal_user_id), niet bij beheer-edits of service-writes.
-- SECURITY DEFINER (owner=postgres, search_path gezet): draait altijd met de juiste rechten,
-- ongeacht de aanroepende rol (les uit de app_private-permissiefix).
create or replace function app_private.tg_ere_stamp_request()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  if NEW.calculate_ere_enabled is true
     and (TG_OP = 'INSERT' or OLD.calculate_ere_enabled is distinct from true)
     and auth.uid() is not null
     and auth.uid() = NEW.portal_user_id
  then
    NEW.ere_requested_at := now();
    NEW.ere_arranged_at  := null;
    NEW.ere_arranged_by  := null;
  end if;
  return NEW;
end $$;

drop trigger if exists zzz_ere_stamp_request on public.clients;
create trigger zzz_ere_stamp_request
  before insert or update of calculate_ere_enabled on public.clients
  for each row execute function app_private.tg_ere_stamp_request();

-- AFTER: seintje aan het team (mail-edge + taak op /sales/taken), zelfde opt-in-voorwaarde.
-- Best-effort: een falend seintje mag de klant-save nooit blokkeren.
create or replace function public.tg_ere_notify_request()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  if NEW.calculate_ere_enabled is true
     and (TG_OP = 'INSERT' or OLD.calculate_ere_enabled is distinct from true)
     and auth.uid() is not null
     and auth.uid() = NEW.portal_user_id
  then
    begin
      perform public.invoke_edge_function('ere-request-notify', jsonb_build_object('client_id', NEW.id));
      insert into public.lead_tasks (organization_id, title, lead_id)
      values (
        NEW.organization_id,
        'Klant ' || coalesce(nullif(trim(NEW.company_name), ''), '(zonder naam)') || ' wil ERE-certificaten aanmelden',
        null
      );
    exception when others then
      raise warning 'ERE-notify faalde voor client %: %', NEW.id, sqlerrm;
    end;
  end if;
  return NEW;
end $$;

drop trigger if exists zzz_ere_notify_request on public.clients;
create trigger zzz_ere_notify_request
  after insert or update of calculate_ere_enabled on public.clients
  for each row execute function public.tg_ere_notify_request();

-- Opvolging: medewerker markeert de ERE-aanvraag als geregeld (kopie van confirm_client_vat_status).
create or replace function public.mark_ere_arranged(p_client_id uuid)
returns table(id uuid, ere_requested_at timestamptz, ere_arranged_at timestamptz)
language plpgsql security definer set search_path = 'public' as $$
begin
  if not (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    or app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) then
    raise exception 'Alleen admin/manager mag een ERE-aanvraag afronden' using errcode = '42501';
  end if;

  update public.clients c
  set ere_arranged_at = now(),
      ere_arranged_by = auth.uid(),
      updated_at      = now()
  where c.id = p_client_id;

  if not found then
    raise exception 'Klant bestaat niet';
  end if;

  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (p_client_id, auth.uid(), 'client_ere_arranged',
          'ERE-aanvraag gemarkeerd als geregeld door medewerker',
          jsonb_build_object('arranged_at', now()));

  return query
  select c.id, c.ere_requested_at, c.ere_arranged_at
  from public.clients c where c.id = p_client_id;
end $$;

grant execute on function public.mark_ere_arranged(uuid) to authenticated;
