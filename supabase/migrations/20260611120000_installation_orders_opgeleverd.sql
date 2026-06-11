-- Nieuwe status 'opgeleverd' (werkbon afgetekend voor oplevering in de e-portal) +
-- delivered_at-tijdstempel. De e-portal seint dit binnen via de installation-delivered
-- edge function; e-charging weet dan dat er een installatiefactuur gestuurd moet worden.
-- Statusflow: nieuw -> overgedragen -> ingepland -> geinstalleerd -> opgeleverd
--   -> afgerond (= gefactureerd/klaar) -> (geannuleerd).

-- De oude CHECK is inline/zonder expliciete naam (conventioneel
-- installation_orders_status_check). Drop hem robuust — ook als de naam afwijkt —
-- en herbouw met 'opgeleverd' erbij.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.installation_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.installation_orders drop constraint %I', c);
  end loop;
end $$;

alter table public.installation_orders
  add constraint installation_orders_status_check
  check (status in ('nieuw','overgedragen','ingepland','geinstalleerd','opgeleverd','afgerond','geannuleerd'));

alter table public.installation_orders
  add column if not exists delivered_at timestamptz;
