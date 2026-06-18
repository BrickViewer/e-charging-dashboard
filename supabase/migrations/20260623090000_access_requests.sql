-- Toegangsverzoek-flow: een @e-group.nl-account dat via Microsoft inlogt zonder rol
-- vraagt automatisch toegang aan. Admins zien dit onder Gebruikers en kennen een rol toe.

do $$ begin
  create type public.access_request_status as enum ('pending', 'approved', 'denied');
exception when duplicate_object then null; end $$;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status public.access_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  role_granted public.app_role
);
create index if not exists access_requests_status_idx on public.access_requests(status);

alter table public.access_requests enable row level security;

-- Interne staf mag de lijst lezen (voor de Gebruikers-tab).
drop policy if exists "internal can read access_requests" on public.access_requests;
create policy "internal can read access_requests" on public.access_requests
  for select to authenticated
  using (app_private.is_internal(auth.uid()));

-- De aanvrager mag z'n EIGEN verzoek zien, óók zonder rol (is_internal zou dan false zijn).
drop policy if exists "requester reads own access_request" on public.access_requests;
create policy "requester reads own access_request" on public.access_requests
  for select to authenticated
  using (user_id = auth.uid());

-- Geen insert/update/delete-policy voor authenticated: alle schrijfacties lopen via de
-- trigger (security definer) of de edge-functie (service-role), die RLS omzeilen.

-- handle_new_user: profiel + org (zoals nu), dan grant → rol, ANDERS bij @e-group.nl → verzoek.
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
  elsif new.email ilike '%@e-group.nl' then
    insert into public.access_requests (user_id, email, full_name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$function$;

-- Backfill: bestaande @e-group.nl-accounts zonder rol (en geen klant) als pending verzoek.
insert into public.access_requests (user_id, email, full_name)
select u.id, u.email, coalesce(p.full_name, u.email)
from auth.users u
join public.profiles p on p.user_id = u.id
left join public.user_roles r on r.user_id = u.id
left join public.clients c on c.portal_user_id = u.id
where r.role is null and c.id is null and lower(u.email) like '%@e-group.nl'
on conflict (user_id) do nothing;
