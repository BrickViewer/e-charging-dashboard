-- Contactformulier komt als LEAD binnen (contacten-laag). Alleen een onzichtbaar
-- throttle-logje voor per-IP rate-limiting in de contact-intake edge-functie.
drop table if exists public.contact_messages;

create table if not exists public.contact_intake_log (
  id uuid primary key default gen_random_uuid(),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists contact_intake_log_idx on public.contact_intake_log(ip_hash, created_at desc);
alter table public.contact_intake_log enable row level security;
