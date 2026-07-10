-- Observability voor de blogmachine: elke stap van een run laat een spoor achter.
-- Stille isolate-dood is anders niet te diagnosticeren (geen logs, geen mail).
-- Insert-only vanuit edge functions (service role); dashboard kan later meelezen.
create table if not exists public.content_engine_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  fn text not null,
  step text not null,
  detail jsonb not null default '{}'::jsonb
);

alter table public.content_engine_events enable row level security;

-- Alleen beheer/marketing leest mee; schrijven gebeurt met service role (passeert RLS).
create policy "content_engine_events_admin_read"
  on public.content_engine_events for select
  using (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'marketing'));

create index if not exists content_engine_events_at_idx on public.content_engine_events (at desc);
