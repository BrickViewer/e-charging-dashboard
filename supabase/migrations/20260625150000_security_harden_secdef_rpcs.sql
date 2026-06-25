-- Security-audit remediation: lock down SECURITY DEFINER RPCs exposed via PostgREST + pin search_path.
-- Verified: all three functions retain explicit service_role=EXECUTE, so the edge (service_role) paths
-- keep working after revoking anon/authenticated.

-- HIGH — erase_client_for_privacy authorizes on the caller-supplied p_performed_by (not auth.uid())
-- AND was anon/authenticated-executable → an anon PostgREST RPC call with a known admin UUID could
-- run the destructive client scrub, bypassing the erase-client edge admin gate. It is only ever
-- invoked by that edge via service_role, so remove anon/authenticated EXECUTE entirely. (The param
-- guard stays as defense-in-depth; service_role retains EXECUTE.)
revoke execute on function public.erase_client_for_privacy(uuid, text, uuid) from anon, authenticated, public;

-- LOW — next_offer_number() has no app call site (numbering is assigned by the quotes_set_number
-- trigger); anon could only burn the sequence. Remove anon/authenticated EXECUTE.
revoke execute on function public.next_offer_number() from anon, authenticated, public;

-- MEDIUM — assign_document_number is SECURITY DEFINER with no auth check, callable by authenticated
-- (internal staff via sharepoint.ts) AND edges (service_role). Without a guard, any signed-in user
-- (incl. a portal client) could increment doc_seq on ANY location (RLS-bypassing tampering). Add an
-- internal-OR-service_role guard (same idiom as accept_client_invitation). Keep the authenticated
-- grant so internal staff's direct call still works; the body now blocks portal clients.
create or replace function public.assign_document_number(p_location_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_seq integer;
begin
  if not (app_private.is_internal(auth.uid()) or auth.role() = 'service_role') then
    raise exception 'Niet toegestaan' using errcode = '42501';
  end if;
  update public.project_locations
    set doc_seq = doc_seq + 1, updated_at = now()
    where id = p_location_id
    returning doc_seq into v_seq;
  return v_seq;
end
$function$;

-- LOW — pin search_path on the 4 functions flagged function_search_path_mutable (all SECURITY INVOKER;
-- hardening against search_path shadowing).
alter function public.tg_contacts_set_updated_at() set search_path = public;
alter function public.amsterdam_month_bounds(integer, integer) set search_path = public;
alter function app_private.split_person_name(text) set search_path = public;
alter function app_private.split_dutch_address(text) set search_path = public;
