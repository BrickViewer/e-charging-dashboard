-- Backstop: naar een is_lost-fase verplaatsen mag alleen met een lost_reason_id.
-- Draait vóór leads_set_status (alfabetische triggervolgorde). Het nette pad
-- (MarkLostDialog) stuurt stage_id + lost_reason_id samen mee; dit blokkeert elk
-- ander pad (bv. een stale browser-tab met de oude frontend).
create or replace function public.tg_leads_require_lost_reason()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_lost boolean;
begin
  if (new.stage_id is distinct from old.stage_id) and new.stage_id is not null then
    select is_lost into v_lost from public.lead_stages where id = new.stage_id;
    if coalesce(v_lost, false) and new.lost_reason_id is null then
      raise exception 'Kies een reden waarom deze lead verloren is.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists leads_require_lost_reason on public.leads;
create trigger leads_require_lost_reason
  before update on public.leads
  for each row execute function public.tg_leads_require_lost_reason();
