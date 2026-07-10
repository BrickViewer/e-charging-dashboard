-- Bestellinks op catalogusproducten: één primaire bestel-URL per artikel, plus
-- optioneel extra links van alternatieve leveranciers ([{"label","url"}, …]).
-- Additief; de bestaande RLS-policies (lezen intern, schrijven admin/manager/sales)
-- dekken de nieuwe kolommen.
alter table public.catalog_products
  add column if not exists order_url text,
  add column if not exists extra_links jsonb not null default '[]'::jsonb;
