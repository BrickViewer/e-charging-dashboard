-- Microsoft/Entra-SSO voor de admin: de superadmin kent een rol toe op e-mailadres
-- (vóór de eerste login). Bij de eerste Microsoft-login krijgt die e-group'er dan
-- automatisch de toegekende rol. Dit ontkoppelt rol-toekenning van het wachtwoord-invite.

create table if not exists public.internal_role_grants (
  email text primary key,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.internal_role_grants enable row level security;

-- Alleen de superadmin beheert grants; interne gebruikers mogen lezen (voor de Gebruikers-tab).
drop policy if exists "superadmin manages role grants" on public.internal_role_grants;
create policy "superadmin manages role grants" on public.internal_role_grants
  for all to authenticated
  using (app_private.has_role(auth.uid(), 'superadmin'::public.app_role))
  with check (app_private.has_role(auth.uid(), 'superadmin'::public.app_role));

drop policy if exists "internal can read role grants" on public.internal_role_grants;
create policy "internal can read role grants" on public.internal_role_grants
  for select to authenticated
  using (app_private.is_internal(auth.uid()));

-- handle_new_user: profiel + org (zoals nu) én — als er een grant voor dit e-mailadres
-- bestaat — meteen de toegekende rol. superadmin krijgt óók 'admin' (admin-RLS hangt daarop).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role public.app_role;
begin
  insert into public.profiles (user_id, full_name, organization_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from public.organizations order by created_at limit 1)
  );

  select role into v_role from public.internal_role_grants where lower(email) = lower(new.email);
  if v_role is not null then
    insert into public.user_roles (user_id, role) values (new.id, v_role) on conflict (user_id, role) do nothing;
    if v_role = 'superadmin'::public.app_role then
      insert into public.user_roles (user_id, role) values (new.id, 'admin'::public.app_role) on conflict (user_id, role) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

-- Vangnet voor de bestaande staf: mocht Supabase bij hun eerste Microsoft-login onverhoopt
-- een NIEUW account maken i.p.v. te koppelen, dan herstelt de trigger hun rol alsnog.
insert into public.internal_role_grants (email, role) values
  ('wessel.jonkers@e-group.nl', 'superadmin'::public.app_role),
  ('quinten.vangameren@e-group.nl', 'admin'::public.app_role),
  ('willi-jan.jonkers@e-group.nl', 'admin'::public.app_role),
  ('theo.vandevoort@e-group.nl', 'admin'::public.app_role)
on conflict (email) do nothing;
