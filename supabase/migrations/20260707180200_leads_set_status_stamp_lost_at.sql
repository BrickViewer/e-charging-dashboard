-- Breidt de bestaande status-trigger uit: stempel lost_at bij binnenkomst in een
-- is_lost-fase (spiegel van won_at), en wis lost_at/lost_reason(_id) zodra de lead
-- de verloren-fase verlaat (heropenen/winnen). won_at-gedrag ongewijzigd.
create or replace function public.tg_leads_set_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      if v_lost then
        new.lost_at := coalesce(new.lost_at, now());
      else
        new.lost_at := null;
        new.lost_reason_id := null;
        new.lost_reason := null;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;
