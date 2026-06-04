ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_payout_onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payments_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_mandate_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS stripe_mandate_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS stripe_mandate_reference text,
  ADD COLUMN IF NOT EXISTS stripe_mandate_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_mandate_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at timestamptz;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_stripe_mandate_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_stripe_mandate_status_check
  CHECK (stripe_mandate_status IN ('not_started', 'setup_pending', 'active', 'inactive', 'failed'));

CREATE INDEX IF NOT EXISTS clients_stripe_mandate_id_idx
  ON public.clients (stripe_mandate_id)
  WHERE stripe_mandate_id IS NOT NULL;

ALTER TABLE public.quarterly_settlements
  ADD COLUMN IF NOT EXISTS stripe_collection_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_collection_amount_cents integer,
  ADD COLUMN IF NOT EXISTS stripe_collection_currency text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS stripe_collection_status text,
  ADD COLUMN IF NOT EXISTS stripe_collection_error text,
  ADD COLUMN IF NOT EXISTS stripe_collection_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_collection_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_collection_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_collection_disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_collection_dispute_reason text,
  ADD COLUMN IF NOT EXISTS stripe_collection_idempotency_key text;

ALTER TABLE public.quarterly_settlements DROP CONSTRAINT IF EXISTS quarterly_settlements_stripe_collection_status_check;
ALTER TABLE public.quarterly_settlements
  ADD CONSTRAINT quarterly_settlements_stripe_collection_status_check
  CHECK (
    stripe_collection_status IS NULL
    OR stripe_collection_status IN (
      'collection_pending',
      'processing',
      'collected',
      'collection_failed',
      'disputed',
      'canceled'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS quarterly_settlements_stripe_collection_payment_intent_id_idx
  ON public.quarterly_settlements (stripe_collection_payment_intent_id)
  WHERE stripe_collection_payment_intent_id IS NOT NULL;

ALTER TABLE public.quarterly_settlements DROP CONSTRAINT IF EXISTS quarterly_settlements_status_check;
ALTER TABLE public.quarterly_settlements
  ADD CONSTRAINT quarterly_settlements_status_check
  CHECK (status IN ('live', 'calculated', 'approved', 'paid', 'charged_back', 'overdue'));
