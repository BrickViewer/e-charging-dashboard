-- Koppel een configurator-sessie optioneel aan een lead (voor prefill + terugkoppeling).
alter table public.configurator_sessions
  add column if not exists lead_id uuid references public.leads(id) on delete set null;
create index if not exists configurator_sessions_lead_idx on public.configurator_sessions(lead_id);
