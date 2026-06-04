ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_requirements_currently_due text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stripe_requirements_past_due text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stripe_requirements_disabled_reason text,
  ADD COLUMN IF NOT EXISTS stripe_account_livemode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at timestamptz;

ALTER TABLE public.clients
  ALTER COLUMN stripe_onboarding_status SET DEFAULT 'not_started';

UPDATE public.clients
SET stripe_onboarding_status = 'not_started'
WHERE stripe_onboarding_status IS NULL;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_stripe_onboarding_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_stripe_onboarding_status_check
  CHECK (
    stripe_onboarding_status IN (
      'not_started',
      'pending',
      'onboarding',
      'complete',
      'active',
      'restricted',
      'disabled',
      'error'
    )
  );

ALTER TABLE public.quarterly_settlements
  ADD COLUMN IF NOT EXISTS stripe_transfer_amount_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_transfer_currency text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS stripe_transfer_status text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_error text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_idempotency_key text;

ALTER TABLE public.quarterly_settlements DROP CONSTRAINT IF EXISTS quarterly_settlements_stripe_transfer_status_check;
ALTER TABLE public.quarterly_settlements
  ADD CONSTRAINT quarterly_settlements_stripe_transfer_status_check
  CHECK (
    stripe_transfer_status IS NULL
    OR stripe_transfer_status IN ('pending', 'succeeded', 'failed', 'reversed')
  );

CREATE UNIQUE INDEX IF NOT EXISTS quarterly_settlements_stripe_transfer_id_idx
  ON public.quarterly_settlements (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_stripe_connected_account_id_idx
  ON public.clients (stripe_connected_account_id)
  WHERE stripe_connected_account_id IS NOT NULL;
