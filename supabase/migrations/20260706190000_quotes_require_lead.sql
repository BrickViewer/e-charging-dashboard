-- Elke offerte hoort in de leads-pipeline (inzicht in opvolging). De app-laag borgt dit al
-- (quote-create koppelt of maakt altijd een lead; quote-create-from-lead sowieso); dit is het
-- DB-vangnet zodat het via geen enkel (toekomstig) pad meer stil kan misgaan:
-- 1) BEFORE-trigger: nieuwe offertes zonder lead_id worden geweigerd, en een gevulde lead_id
--    mag niet meer op NULL worden gezet. Bestaande null-rijen (legacy/seed) blijven geldig.
-- 2) FK on delete set null -> restrict: een lead met offertes kan niet meer stilletjes
--    verdwijnen (dat zou de offerte opnieuw uit de pipeline laten vallen). De frontend toont
--    hiervoor een nette melding (useDeleteLead).

create or replace function app_private.tg_quotes_require_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.lead_id is null then
      raise exception 'Elke offerte moet aan een lead gekoppeld zijn (lead_id ontbreekt)'
        using errcode = '23514';
    end if;
  elsif new.lead_id is null and old.lead_id is not null then
    raise exception 'De lead-koppeling van een offerte kan niet worden verwijderd (wel gewijzigd)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_require_lead on public.quotes;
create trigger quotes_require_lead
  before insert or update of lead_id on public.quotes
  for each row execute function app_private.tg_quotes_require_lead();

-- FK-naam kan per omgeving verschillen -> dynamisch opzoeken en vervangen door RESTRICT.
do $$
declare v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'quotes' and con.contype = 'f' and att.attname = 'lead_id';
  if v_name is not null then
    execute format('alter table public.quotes drop constraint %I', v_name);
  end if;
end $$;

alter table public.quotes
  add constraint quotes_lead_id_fkey foreign key (lead_id)
  references public.leads(id) on delete restrict;
