-- Correctie: bij parkeren/verwijderen blijven ALLEEN finale (goedgekeurde/gefactureerde) settlements
-- staan — niet elke rij met een gereserveerd invoice-nummer. Een 'calculated'-rij met een gereserveerd
-- nummer maar zonder verstuurde factuur (invoice_sent_at NULL) is geen omzet en hoort weg.
-- park_location: open-settlement-criterium nu = "niet in een finale status" (gelijk aan session_is_settled).
create or replace function app_private.park_location(p_location_id uuid, p_new_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private'
as $$
declare
  v_location public.locations%rowtype;
  v_previous_client_id uuid;
  v_action text;
  v_reassigned_sessions integer := 0;
  v_retained_final_sessions integer := 0;
  v_deleted_open_settlements integer := 0;
begin
  perform set_config('app.allow_location_client_change', 'on', true);

  select * into v_location from public.locations l where l.id = p_location_id for update;
  if not found then raise exception 'Locatie niet gevonden'; end if;
  v_previous_client_id := v_location.client_id;

  drop table if exists pg_temp.park_scope;
  create temp table pg_temp.park_scope on commit drop as
  select cs.id, cs.client_id as old_client_id, sp.yr, sp.mo,
         app_private.session_is_settled(cs.client_id, cs.started_at) as is_final
  from public.charging_sessions cs
  cross join lateral app_private.session_period(cs.started_at) sp
  where cs.location_id = p_location_id;

  select count(*) into v_retained_final_sessions from pg_temp.park_scope where is_final;

  with affected as (
    select old_client_id as cid, yr, mo from pg_temp.park_scope where not is_final and old_client_id is not null
    union
    select p_new_client_id, yr, mo from pg_temp.park_scope where not is_final and p_new_client_id is not null
  ),
  locked as (
    select s.id
    from public.settlements s
    join affected a on a.cid = s.client_id and a.yr = s.year and a.mo = s.month
    where s.status <> all (array['approved','paid','invoice_sent','invoice_paid','charged_back'])
    for update
  )
  delete from public.settlements s using locked l where s.id = l.id;
  get diagnostics v_deleted_open_settlements = row_count;

  update public.charging_sessions cs
  set client_id = p_new_client_id, updated_at = now()
  from pg_temp.park_scope sc
  where cs.id = sc.id and not sc.is_final and cs.client_id is distinct from p_new_client_id;
  get diagnostics v_reassigned_sessions = row_count;

  update public.locations l
  set client_id = p_new_client_id,
      client_assigned_at = case
        when p_new_client_id is null then null
        when v_previous_client_id is distinct from p_new_client_id then now()
        else l.client_assigned_at end,
      updated_at = now()
  where l.id = p_location_id
  returning * into v_location;

  v_action := case when p_new_client_id is null then 'location_unlinked' else 'location_linked' end;
  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (
    coalesce(p_new_client_id, v_previous_client_id), auth.uid(), v_action,
    case when p_new_client_id is null then 'Locatie geparkeerd (ontkoppeld)' else 'Locatie gekoppeld aan klant' end,
    jsonb_build_object('location_id', p_location_id, 'previous_client_id', v_previous_client_id,
      'client_id', p_new_client_id, 'reassigned_sessions', v_reassigned_sessions,
      'retained_final_sessions', v_retained_final_sessions, 'deleted_open_settlements', v_deleted_open_settlements)
  );

  return jsonb_build_object('location', to_jsonb(v_location),
    'previous_client_id', v_previous_client_id, 'client_id', p_new_client_id,
    'reassigned_sessions', v_reassigned_sessions, 'retained_final_sessions', v_retained_final_sessions,
    'deleted_open_settlements', v_deleted_open_settlements);
end;
$$;

-- Eenmalige opruiming: bestaande niet-finale settlements van verwijderde klanten weg
-- (bv. de 'calculated' apr-2026-rij met gereserveerd maar niet-verstuurd factuurnummer).
delete from public.settlements s
using public.clients c
where c.id = s.client_id
  and c.status = 'verwijderd'
  and s.status <> all (array['approved','paid','invoice_sent','invoice_paid','charged_back']);
