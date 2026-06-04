-- Bank details no longer require an admin review step.
-- Once a portal user saves valid bank details, the status is simply saved.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_payment_onboarding_status_check;
ALTER TABLE public.client_payment_details DROP CONSTRAINT IF EXISTS client_payment_details_status_check;

UPDATE public.client_payment_details
SET
  status = 'saved',
  verified_at = NULL,
  verified_by = NULL,
  rejected_at = NULL,
  rejection_reason = NULL,
  updated_at = now()
WHERE status = 'needs_review';

UPDATE public.clients
SET
  payment_onboarding_status = 'saved',
  payment_onboarding_verified_at = NULL
WHERE payment_onboarding_status = 'needs_review';

ALTER TABLE public.clients
  ADD CONSTRAINT clients_payment_onboarding_status_check
  CHECK (payment_onboarding_status IN ('missing', 'saved'));

ALTER TABLE public.client_payment_details
  ADD CONSTRAINT client_payment_details_status_check
  CHECK (status IN ('missing', 'saved'));
