-- Eén installatie-order per getekende offerte. De idempotentie van
-- create_order_from_quote / create_client_from_quote is puur application-level
-- ("if not exists ... insert"), dus een race tussen de sign-trigger en het
-- aanmaken van het klantaccount kon twee orders per offerte opleveren. Precies
-- het geval waarin activeOrder() op het onboarding-bord de verkeerde order pakt.
-- Vooraf geverifieerd op de live DB: 0 offertes met meer dan één order.
create unique index if not exists installation_orders_quote_id_uidx
  on public.installation_orders (quote_id) where quote_id is not null;
