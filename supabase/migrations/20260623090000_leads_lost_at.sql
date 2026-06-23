-- Leads: lost_at (symmetrisch met won_at) zodat het archief een "afgehandeld op"-datum
-- heeft voor verloren leads en we verlies-analyse kunnen doen. De trigger zet lost_at
-- wanneer de lead naar een is_lost-fase gaat (en wist 'm anders). lost_reason bestaat al.
alter table public.leads add column if not exists lost_at timestamptz;

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
      if v_won then new.won_at := coalesce(new.won_at, now()); else new.won_at := null; end if;
      if v_lost then new.lost_at := coalesce(new.lost_at, now()); else new.lost_at := null; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Backfill lost_at voor bestaande verloren leads.
update public.leads l set lost_at = coalesce(l.lost_at, l.updated_at)
from public.lead_stages s
where l.stage_id = s.id and s.is_lost and l.lost_at is null;
