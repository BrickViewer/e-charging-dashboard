-- Nieuwe gebruikers kregen een profiel ZONDER organization_id, waardoor org-afhankelijke
-- acties (o.a. SharePoint-koppeling opslaan) faalden met "Geen organisatie gevonden".
-- Ken nieuwe profielen voortaan de (enige) organisatie toe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (user_id, full_name, organization_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from public.organizations order by created_at limit 1)
  );
  return new;
end;
$function$;
