-- Audit-trail voor juridisch bindende offerte-ondertekening (eIDAS SES/AdES + BW 3:15a/6:227a).
-- Eén onveranderlijke bewijsregel per ondertekening: wie (naam/e-mail/functie), expliciete
-- instemming (bevoegdheid + akkoord), wanneer (signed_at), waarvandaan (ip/user_agent) en
-- integriteit (document_sha256 van de getekende PDF). Schrijven gebeurt via service-role in de
-- edge fn quote-accept; alleen interne medewerkers mogen lezen (geen client-writes via RLS).
create table if not exists public.quote_signature_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  acceptance_id uuid references public.quote_acceptances(id) on delete set null,
  signer_name text not null,
  signer_email text,
  signer_function text,
  authority_confirmed boolean not null default false,   -- vinkje 1: bevoegd om te tekenen
  terms_accepted boolean not null default false,        -- vinkje 2: offerte + AV + VWO + e-sign
  terms_version text,                                    -- pointer naar de AV/VWO-versie
  document_sha256 text,                                  -- hash van de getekende PDF (integriteit)
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists quote_signature_evidence_quote_idx on public.quote_signature_evidence(quote_id);
create index if not exists quote_signature_evidence_org_idx on public.quote_signature_evidence(organization_id);

alter table public.quote_signature_evidence enable row level security;

drop policy if exists "Internal users can view quote_signature_evidence" on public.quote_signature_evidence;
create policy "Internal users can view quote_signature_evidence" on public.quote_signature_evidence
  for select to authenticated using (app_private.is_internal(auth.uid()));
