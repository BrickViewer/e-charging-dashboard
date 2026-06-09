-- Rate-limit-log voor de publieke password-reset edge-functie (alleen service_role).
create table if not exists public.password_reset_log (
  id bigint generated always as identity primary key,
  ip_hash text,
  email_hash text,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_log_created_idx on public.password_reset_log(created_at);
alter table public.password_reset_log enable row level security;
