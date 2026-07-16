-- Offerte-tekstversie (commissionairs-handboek): de vaste offerte-copy is per 2026-07-16
-- fee-vrij herschreven (afname-model). Verstuurde offertes worden op de accept-/detailpagina
-- her-gerenderd uit de huidige code; zonder maatregel zou de nieuwe copy een reeds verstuurd
-- (of getekend) document retroactief wijzigen.
--
-- Daarom: alle op dit moment verstuurde offertes krijgen offer_details.text_version = 1,
-- waarmee de renderer (apps/admin/src/services/offerTemplate.ts) exact de oorspronkelijke
-- teksten blijft tonen. Afwezig veld (concepten + alle toekomstige offertes) = versie 2 =
-- handboek-conforme teksten. Idempotent: bestaande text_version wordt niet overschreven.

UPDATE public.quotes
SET offer_details = COALESCE(offer_details, '{}'::jsonb) || '{"text_version": 1}'::jsonb
WHERE sent_at IS NOT NULL
  AND NOT (COALESCE(offer_details, '{}'::jsonb) ? 'text_version');
