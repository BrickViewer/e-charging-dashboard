-- Privacy-wis neemt het gekoppelde contact mee (helpers: zie 20260724100000).
--
-- Zonder deze stap bleef bij een particulier de VOLLEDIGE persoonsgegevensset
-- (naam/e-mail/telefoon/adres) gewoon in Contacten → Personen staan, terwijl de klantrij
-- keurig geanonimiseerd was. Omdat persons/companies de bron van waarheid voor identiteit
-- zijn, was het recht op vergetelheid daarmee feitelijk niet uitgevoerd.
--
-- Alleen anonimiseren als er geen ander levend werk aan het contact hangt; anders laten
-- staan en expliciet melden (return + client_erasure_log.metadata.contacts_kept).
-- De FK wordt losgekoppeld vóór het anonimiseren, zodat tg_*_propagate het erasure-label
-- op deze klant niet overschrijft met het contactlabel.

CREATE OR REPLACE FUNCTION public.erase_client_for_privacy(p_client_id uuid, p_reason text, p_performed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
declare
  v_client public.clients%rowtype;
  v_portal_user_id uuid;
  v_erased_label text := 'Verwijderd klantprofiel';
  v_payment_details_deleted integer := 0;
  v_invitations_deleted integer := 0;
  v_locations_unlinked integer := 0;
  v_tariff_profiles_deleted integer := 0;
  v_quotes_scrubbed integer := 0;
  v_activity_log_scrubbed integer := 0;
  v_notifications_deleted integer := 0;
  v_profiles_deleted integer := 0;
  v_person_erased boolean := false;
  v_company_erased boolean := false;
  v_contacts_kept text[] := '{}';
  v_loc record;
  v_reason text := left(trim(coalesce(nullif(p_reason, ''), 'Klantprofiel verwijderd via admin')), 1000);
begin
  if p_performed_by is null
    or not app_private.has_role(p_performed_by, 'admin'::public.app_role)
  then
    raise exception 'Alleen admins mogen klantprofielen verwijderen' using errcode = '42501';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Klant niet gevonden' using errcode = 'P0002';
  end if;
  if v_client.status = 'verwijderd' then
    raise exception 'Klantprofiel is al verwijderd' using errcode = '23505';
  end if;

  v_portal_user_id := v_client.portal_user_id;

  delete from public.client_payment_details where client_id = p_client_id;
  get diagnostics v_payment_details_deleted = row_count;

  delete from public.client_invitations where client_id = p_client_id;
  get diagnostics v_invitations_deleted = row_count;

  delete from public.tariff_profiles where client_id = p_client_id;
  get diagnostics v_tariff_profiles_deleted = row_count;

  if v_portal_user_id is not null then
    delete from public.notifications where recipient_id = v_portal_user_id;
    get diagnostics v_notifications_deleted = row_count;
    delete from public.profiles where user_id = v_portal_user_id;
    get diagnostics v_profiles_deleted = row_count;
    update public.activity_log set user_id = null where user_id = v_portal_user_id;
  end if;

  update public.quotes
  set prospect_company = v_erased_label, prospect_contact = null, prospect_email = null,
      locations_data = null, calculation_snapshot = null, notes = null, updated_at = now()
  where client_id = p_client_id;
  get diagnostics v_quotes_scrubbed = row_count;

  update public.activity_log
  set description = 'Historische klantactiviteit geanonimiseerd', details = null,
      metadata = jsonb_build_object('deleted_profile', true, 'client_number', v_client.client_number)
  where client_id = p_client_id;
  get diagnostics v_activity_log_scrubbed = row_count;

  for v_loc in select id from public.locations where client_id = p_client_id loop
    perform app_private.park_location(v_loc.id, null);
    v_locations_unlinked := v_locations_unlinked + 1;
  end loop;

  update public.clients
  set company_name = v_erased_label, client_number = null, kvk = null, btw_number = null,
      contact_name = null, contact_email = null, contact_phone = null, billing_address = null,
      billing_address_street = null, billing_address_postal = null, billing_address_city = null,
      contract_start_date = null, contract_duration_months = null, revenue_share_percentage = null,
      charge_rate_per_kwh = null, energy_cost_per_kwh = null, ere_rate_per_kwh = null,
      monthly_platform_surcharge = 0, auto_renew = false, notice_period_months = 0,
      eflux_account_id = null, notes = null, portal_user_id = null,
      payment_onboarding_status = 'missing', payment_onboarding_submitted_at = null,
      payment_onboarding_verified_at = null, calculate_ere_enabled = false,
      status = 'verwijderd', erased_at = now(), erased_by = p_performed_by, erasure_reason = v_reason,
      updated_at = now()
  where id = p_client_id;

  -- Contacten zijn de bron van waarheid voor identiteit → hier hoort de wis door te lopen.
  if v_client.person_id is not null then
    if app_private.contact_has_other_refs('persons', v_client.person_id, p_client_id) then
      v_contacts_kept := v_contacts_kept || ('persoon:' || v_client.person_id::text);
    else
      update public.clients set person_id = null where id = p_client_id;
      perform app_private.anonymize_contact('persons', v_client.person_id);
      v_person_erased := true;
    end if;
  end if;

  if v_client.company_id is not null then
    if app_private.contact_has_other_refs('companies', v_client.company_id, p_client_id) then
      v_contacts_kept := v_contacts_kept || ('bedrijf:' || v_client.company_id::text);
    else
      update public.clients set company_id = null where id = p_client_id;
      perform app_private.anonymize_contact('companies', v_client.company_id);
      v_company_erased := true;
    end if;
  end if;

  insert into public.client_erasure_log (
    client_id, client_number, erased_client_label, performed_by, reason,
    payment_details_deleted, invitations_deleted, locations_unlinked, tariff_profiles_deleted,
    quotes_scrubbed, activity_log_scrubbed, notifications_deleted, profiles_deleted, metadata)
  values (
    p_client_id, v_client.client_number, v_erased_label, p_performed_by, v_reason,
    v_payment_details_deleted, v_invitations_deleted, v_locations_unlinked, v_tariff_profiles_deleted,
    v_quotes_scrubbed, v_activity_log_scrubbed, v_notifications_deleted, v_profiles_deleted,
    jsonb_build_object('portal_user_removed', v_portal_user_id is not null, 'previous_status', v_client.status,
      'person_anonymized', v_person_erased, 'company_anonymized', v_company_erased,
      'contacts_kept', to_jsonb(v_contacts_kept)));

  insert into public.activity_log (client_id, user_id, action, description, metadata)
  values (p_client_id, p_performed_by, 'client_profile_deleted', 'Klantprofiel verwijderd',
    jsonb_build_object('client_number', v_client.client_number, 'locations_unlinked', v_locations_unlinked,
      'payment_details_deleted', v_payment_details_deleted,
      'person_anonymized', v_person_erased, 'company_anonymized', v_company_erased));

  return jsonb_build_object(
    'client_id', p_client_id, 'client_number', v_client.client_number,
    'erased_client_label', v_erased_label, 'portal_user_id', v_portal_user_id,
    'person_anonymized', v_person_erased, 'company_anonymized', v_company_erased,
    'contacts_kept', to_jsonb(v_contacts_kept),
    'counts', jsonb_build_object(
      'payment_details_deleted', v_payment_details_deleted, 'invitations_deleted', v_invitations_deleted,
      'locations_unlinked', v_locations_unlinked, 'tariff_profiles_deleted', v_tariff_profiles_deleted,
      'quotes_scrubbed', v_quotes_scrubbed, 'activity_log_scrubbed', v_activity_log_scrubbed,
      'notifications_deleted', v_notifications_deleted, 'profiles_deleted', v_profiles_deleted));
end;
$function$;
