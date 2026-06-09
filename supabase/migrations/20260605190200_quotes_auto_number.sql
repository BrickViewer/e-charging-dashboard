-- Offertenummer automatisch toekennen bij insert (OFF-<jaar>-<nnnnn>).
create or replace function public.next_offer_number()
returns text language sql volatile security definer set search_path = public as $$
  select 'OFF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.quotes_offer_seq')::text, 5, '0');
$$;

create or replace function public.tg_quotes_set_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    new.quote_number := public.next_offer_number();
  end if;
  return new;
end $$;

drop trigger if exists quotes_set_number on public.quotes;
create trigger quotes_set_number before insert on public.quotes
  for each row execute function public.tg_quotes_set_number();
