-- Offerteaanvragen vanaf de website (/offerte). De wizard post naar de edge-functie
-- quote-intake: foto's en video's gaan met een signed upload URL rechtstreeks naar
-- een privé-bucket, de aanvraag zelf komt als lead binnen met een gestructureerde
-- kopie in quote_requests. Volledig additief.

-- ── Bucket voor de uploads van aanvragers ──────────────────────────────────────
-- Privé. 150 MB (een route-video), mime-allowlist. Geen HEIC: de accept-lijst in
-- het formulier laat iOS zelf naar JPEG omzetten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-uploads', 'intake-uploads', false, 157286400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do nothing;

-- Uploaden gebeurt met een signed upload token (service role), dus geen INSERT-policy.
-- Lezen doet het dashboard met een korte signed URL; dat vereist wél een SELECT-policy.
drop policy if exists "Internal read intake-uploads" on storage.objects;
create policy "Internal read intake-uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'intake-uploads' and (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales')));

-- ── De aanvraag zelf ──────────────────────────────────────────────────────────
-- leads.message_body houdt een leesbare samenvatting; deze tabel houdt de
-- machineleesbare versie plus de verwijzingen naar de bestanden.
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Verwijder je de lead, dan verdwijnt de aanvraag mee (AVG: foto's van iemands woning).
  lead_id uuid references public.leads(id) on delete cascade,
  flow text not null check (flow in ('particulier','zakelijk')),
  triage text not null check (triage in ('remote_opname','opname_op_locatie','klein_simpel','middel_complex','project')),
  payload jsonb not null,
  -- [{label, kind, path, name, size, content_type}, …]
  files jsonb not null default '[]'::jsonb,
  updates_opt_in boolean not null default false,
  privacy_accepted_at timestamptz not null default now(),
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists quote_requests_lead_idx on public.quote_requests (lead_id);
create index if not exists quote_requests_created_idx on public.quote_requests (created_at desc);

alter table public.quote_requests enable row level security;

-- Alleen lezen, en alleen door het salesteam. Schrijven doet uitsluitend de
-- edge-functie met de service role (die RLS omzeilt) — dus geen insert/update/delete-policy.
drop policy if exists "Internal read quote_requests" on public.quote_requests;
create policy "Internal read quote_requests" on public.quote_requests
  for select to authenticated
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales'));

-- ── Rate-limit-log (gehashte IP's, spiegelt contact_intake_log) ────────────────
create table if not exists public.quote_intake_log (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  kind text not null check (kind in ('upload_url','submit')),
  created_at timestamptz not null default now()
);
create index if not exists quote_intake_log_rate_idx on public.quote_intake_log (ip_hash, kind, created_at desc);
-- RLS aan zonder policies: alleen de service role komt erbij.
alter table public.quote_intake_log enable row level security;

-- ── Instelbaar ontvangeradres voor de interne melding ──────────────────────────
-- Spiegelt organizations.fault_notification_email / handoff_notification_email.
alter table public.organizations
  add column if not exists lead_notification_email text not null default 'info@e-charging.nl';

-- ── Wees-uploads opsporen (voor de dagelijkse opruimjob) ───────────────────────
-- Bestanden die een bezoeker toevoegde maar nooit verstuurde (of weer weghaalde)
-- blijven anders als persoonsgegevens in de bucket staan. De frontend heeft geen
-- verwijderpad: de signed upload URL geeft geen deleterecht.
create or replace function public.quote_intake_orphan_paths(older_than_days int default 30)
returns setof text
language sql
security definer
set search_path = public, storage
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'intake-uploads'
    and o.created_at < now() - make_interval(days => greatest(older_than_days, 0))
    and not exists (
      select 1
      from public.quote_requests qr
      cross join lateral jsonb_array_elements(qr.files) f
      where f->>'path' = o.name
    );
$$;

revoke all on function public.quote_intake_orphan_paths(int) from public;
revoke all on function public.quote_intake_orphan_paths(int) from anon, authenticated;
grant execute on function public.quote_intake_orphan_paths(int) to service_role;
