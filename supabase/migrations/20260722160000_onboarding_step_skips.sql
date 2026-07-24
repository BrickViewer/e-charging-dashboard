-- Eén onboarding-proces: handmatig overgeslagen stappen.
--
-- De onboarding-fase blijft 100% AFGELEID uit de echte status (order verstuurd,
-- gefactureerd, locatie gekoppeld, ...). Deze tabel is de enige uitzondering: een
-- stap die in de praktijk niet van toepassing is kun je met een reden overslaan,
-- zodat de kaart doorschuift zonder de werkelijkheid te vervalsen.
--
-- "Onboarding afsluiten" is GEEN tweede concept: dat slaat simpelweg alle
-- resterende toepasselijke stappen over met dezelfde reden. Heropenen = de rijen
-- weer verwijderen. Zo is er precies één eindtoestand (archief).
--
-- Het ANKER volgt het eigenaarschap van de stap, zodat een skip de overgang
-- clientloze order -> echte klant overleeft (de kaart-id verandert daar):
--   klant_aanmaken                                  -> quote_id (of order als er geen offerte is)
--   klant_uitnodigen / locaties_koppelen / gegevens -> client_id
--   werkvoorbereiding / bij_installateur / opgeleverd -> installation_order_id

create table if not exists public.onboarding_step_skips (
  id uuid primary key default gen_random_uuid(),
  step_key text not null,
  client_id uuid references public.clients(id) on delete cascade,
  installation_order_id uuid references public.installation_orders(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  reason text not null,
  skipped_at timestamptz not null default now(),
  skipped_by uuid default auth.uid(),
  constraint onboarding_step_skips_one_anchor
    check (num_nonnulls(client_id, installation_order_id, quote_id) = 1),
  constraint onboarding_step_skips_reason_not_blank
    check (length(btrim(reason)) > 0)
);

comment on table public.onboarding_step_skips is
  'Handmatig overgeslagen onboarding-stappen (fase blijft verder afgeleid). Eén rij per (anker, stap).';

-- Eén skip per stap per anker; partieel omdat er precies één anker gevuld is.
create unique index if not exists onboarding_step_skips_client_uidx
  on public.onboarding_step_skips (client_id, step_key) where client_id is not null;
create unique index if not exists onboarding_step_skips_order_uidx
  on public.onboarding_step_skips (installation_order_id, step_key) where installation_order_id is not null;
create unique index if not exists onboarding_step_skips_quote_uidx
  on public.onboarding_step_skips (quote_id, step_key) where quote_id is not null;

alter table public.onboarding_step_skips enable row level security;

-- Policies spiegelen exact die op public.clients (20260519104500 + 20260605130100):
-- lezen mag elke interne gebruiker, beheren mag admin/manager en sales.
drop policy if exists "Internal users can view onboarding step skips" on public.onboarding_step_skips;
create policy "Internal users can view onboarding step skips" on public.onboarding_step_skips
  for select to authenticated
  using (app_private.is_internal(auth.uid()));

drop policy if exists "Admins and managers can manage onboarding step skips" on public.onboarding_step_skips;
create policy "Admins and managers can manage onboarding step skips" on public.onboarding_step_skips
  for all to authenticated
  using (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  )
  with check (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'manager'::public.app_role)
  );

drop policy if exists "Sales can manage onboarding step skips" on public.onboarding_step_skips;
create policy "Sales can manage onboarding step skips" on public.onboarding_step_skips
  for all to authenticated
  using (app_private.has_role(auth.uid(), 'sales'::public.app_role))
  with check (app_private.has_role(auth.uid(), 'sales'::public.app_role));
