-- Normalizer-triggers als SECURITY DEFINER: ze draaien altijd als owner (postgres, heeft app_private),
-- ongeacht de aanroepende rol (service_role/anon/authenticated). Lost "permission denied for schema
-- app_private" op bij service-role/anon-schrijfacties op clients/leads/organizations/persons/installation_orders
-- (o.a. de update-portal-bank-details edge die met de service role clients.payment_onboarding_status update).
--
-- Veilig: de functies zijn eigendom van postgres, hebben al `set search_path=''`, en zijn pure normalizers
-- die enkel app_private.to_e164() aanroepen — geen dynamische SQL, geen rol-afhankelijke logica.
alter function app_private.tg_norm_phone() security definer;
alter function app_private.tg_norm_contact_phone() security definer;
alter function app_private.tg_norm_site_contact_phone() security definer;
