-- Eenmalige reconciliatie van bestaande dangling financiële data: parkeer via dezelfde primitive
-- elke locatie die nog aan een verwijderde klant hangt, én elke locatie waarop nog sessies van een
-- verwijderde klant staan. Niet-afgerekende sessies → eigenaarloos; open settlements weg; finale
-- blijven bij de (geanonimiseerde) klant. Idempotent: opnieuw draaien raakt 0 rijen.
do $$
declare r record;
begin
  for r in
    select distinct l.id
    from public.locations l
    join public.clients c on c.id = l.client_id
    where c.status = 'verwijderd'
  loop
    perform app_private.park_location(r.id, null);
  end loop;

  for r in
    select distinct cs.location_id as id
    from public.charging_sessions cs
    join public.clients c on c.id = cs.client_id
    where c.status = 'verwijderd'
  loop
    perform app_private.park_location(r.id, null);
  end loop;
end $$;

-- Wees-open-settlements van verwijderde klanten opruimen (sessies zijn al geparkeerd; geen factuur).
-- Finale/gefactureerde settlements blijven staan (echte omzet → zichtbaar in financieel).
delete from public.settlements s
using public.clients c
where c.id = s.client_id
  and c.status = 'verwijderd'
  and s.status in ('live','calculated')
  and s.invoice_number is null;
