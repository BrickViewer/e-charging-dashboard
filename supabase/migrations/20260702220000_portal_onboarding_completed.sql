-- Portaal-onboarding: durabele "wizard afgerond"-markering.
-- Null = de klant heeft de begeleide onboarding nog niet afgerond → bij (eerste) login toont het portaal
-- de wizard (zachte gate). Gezet door complete_portal_onboarding() aan het eind van de wizard.

alter table public.clients
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.clients.onboarding_completed_at is
  'Wanneer de klant de portaal-onboarding afrondde. Null = nog niet afgerond (wizard verschijnt bij login).';

-- Backfill: klanten die al volledig onboard zijn (bank opgeslagen + BTW-status gekozen) niet opnieuw
-- door de wizard sturen.
update public.clients
set onboarding_completed_at = coalesce(payment_onboarding_submitted_at, updated_at, now())
where onboarding_completed_at is null
  and payment_onboarding_status = 'saved'
  and vat_status is not null;

-- De klant rondt zijn eigen onboarding af (via de wizard). SECURITY DEFINER want de portaalgebruiker
-- heeft geen directe UPDATE-rechten op clients.
create or replace function public.complete_portal_onboarding()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_client_id uuid;
begin
  v_client_id := app_private.get_client_id_for_user(auth.uid());
  if v_client_id is null then
    raise exception 'Geen klantportaal gekoppeld aan deze gebruiker' using errcode = '42501';
  end if;

  update public.clients
  set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = v_client_id;
end;
$$;

grant execute on function public.complete_portal_onboarding() to authenticated;
