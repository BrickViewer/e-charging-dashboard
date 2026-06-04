-- Remove the abandoned Stripe Connect customer onboarding surface.
-- E-Charging now collects bank and invoice details directly via client_payment_details.

DROP INDEX IF EXISTS public.clients_stripe_connected_account_id_idx;
DROP INDEX IF EXISTS public.clients_stripe_mandate_id_idx;
DROP INDEX IF EXISTS public.quarterly_settlements_stripe_transfer_id_idx;
DROP INDEX IF EXISTS public.quarterly_settlements_stripe_collection_payment_intent_id_idx;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_stripe_onboarding_status_check,
  DROP CONSTRAINT IF EXISTS clients_stripe_mandate_status_check;

ALTER TABLE public.quarterly_settlements
  DROP CONSTRAINT IF EXISTS quarterly_settlements_stripe_transfer_status_check,
  DROP CONSTRAINT IF EXISTS quarterly_settlements_stripe_collection_status_check;

ALTER TABLE public.clients
  DROP COLUMN IF EXISTS stripe_connected_account_id,
  DROP COLUMN IF EXISTS stripe_onboarding_status,
  DROP COLUMN IF EXISTS stripe_payouts_enabled,
  DROP COLUMN IF EXISTS stripe_requirements_currently_due,
  DROP COLUMN IF EXISTS stripe_requirements_past_due,
  DROP COLUMN IF EXISTS stripe_requirements_disabled_reason,
  DROP COLUMN IF EXISTS stripe_account_livemode,
  DROP COLUMN IF EXISTS stripe_last_synced_at,
  DROP COLUMN IF EXISTS stripe_payout_onboarding_completed_at,
  DROP COLUMN IF EXISTS stripe_payments_enabled,
  DROP COLUMN IF EXISTS stripe_mandate_status,
  DROP COLUMN IF EXISTS stripe_mandate_id,
  DROP COLUMN IF EXISTS stripe_payment_method_id,
  DROP COLUMN IF EXISTS stripe_payment_method_last4,
  DROP COLUMN IF EXISTS stripe_mandate_reference,
  DROP COLUMN IF EXISTS stripe_mandate_accepted_at,
  DROP COLUMN IF EXISTS stripe_mandate_last_synced_at,
  DROP COLUMN IF EXISTS stripe_onboarding_completed_at;

ALTER TABLE public.quarterly_settlements
  DROP COLUMN IF EXISTS stripe_transfer_id,
  DROP COLUMN IF EXISTS stripe_charge_id,
  DROP COLUMN IF EXISTS stripe_fee,
  DROP COLUMN IF EXISTS stripe_transfer_amount_cents,
  DROP COLUMN IF EXISTS stripe_transfer_currency,
  DROP COLUMN IF EXISTS stripe_transfer_status,
  DROP COLUMN IF EXISTS stripe_transfer_error,
  DROP COLUMN IF EXISTS stripe_transfer_created_at,
  DROP COLUMN IF EXISTS stripe_idempotency_key,
  DROP COLUMN IF EXISTS stripe_collection_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_collection_amount_cents,
  DROP COLUMN IF EXISTS stripe_collection_currency,
  DROP COLUMN IF EXISTS stripe_collection_status,
  DROP COLUMN IF EXISTS stripe_collection_error,
  DROP COLUMN IF EXISTS stripe_collection_created_at,
  DROP COLUMN IF EXISTS stripe_collection_collected_at,
  DROP COLUMN IF EXISTS stripe_collection_failed_at,
  DROP COLUMN IF EXISTS stripe_collection_disputed_at,
  DROP COLUMN IF EXISTS stripe_collection_dispute_reason,
  DROP COLUMN IF EXISTS stripe_collection_idempotency_key;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS stripe_account_id,
  DROP COLUMN IF EXISTS stripe_publishable_key;
