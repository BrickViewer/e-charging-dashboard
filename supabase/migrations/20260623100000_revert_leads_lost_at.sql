-- Terugdraaien van de leads-archief-feature (op verzoek): trigger terug naar de versie
-- zonder lost_at, daarna de lost_at-kolom verwijderen. lost_reason blijft (bestond al).
create or replace function public.tg_leads_set_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_won boolean; v_lost boolean;
begin
  if (tg_op = 'INSERT') or (new.stage_id is distinct from old.stage_id) then
    if new.stage_id is not null then
      select is_won, is_lost into v_won, v_lost from public.lead_stages where id = new.stage_id;
      if v_won then new.status := 'won';
      elsif v_lost then new.status := 'lost';
      else new.status := 'open';
      end if;
      if v_won then
        new.won_at := coalesce(new.won_at, now());
      else
        new.won_at := null;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

alter table public.leads drop column if exists lost_at;
