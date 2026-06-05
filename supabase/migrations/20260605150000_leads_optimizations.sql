-- ============================================================================
-- Leads-optimalisaties: positie-integriteit, won_at, fase-delete-reassign,
-- en atomaire RPC's voor reorder + fase-volgorde.
-- ============================================================================

-- A6) won_at op leads (voor de KPI "Gewonnen deze maand")
alter table public.leads add column if not exists won_at timestamptz;

-- A1) Positie-integriteit: nieuwe leads bovenaan hun fase, uniek/stabiel.
create or replace function public.tg_leads_set_position() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage_id is not null then
    new.position := coalesce(
      (select min(position) from public.leads where stage_id = new.stage_id and organization_id = new.organization_id),
      0
    ) - 1;
  end if;
  return new;
end $$;

drop trigger if exists leads_set_position on public.leads;
create trigger leads_set_position before insert on public.leads
  for each row execute function public.tg_leads_set_position();

-- A6) Status + won_at afleiden van de fase (vervangt de bestaande functie).
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

-- A4) Fase verwijderen → leads naar de default/eerste resterende fase (niet verweesd).
create or replace function public.tg_stage_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from public.lead_stages
   where organization_id = old.organization_id and id <> old.id
   order by is_default desc, position asc
   limit 1;
  if target is not null then
    update public.leads set stage_id = target where stage_id = old.id;
  end if;
  return old;
end $$;

drop trigger if exists lead_stages_before_delete on public.lead_stages;
create trigger lead_stages_before_delete before delete on public.lead_stages
  for each row execute function public.tg_stage_before_delete();

-- A1) Atomaire reorder van leads (één transactie i.p.v. N losse UPDATE's).
create or replace function public.reorder_leads(p_updates jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  if not (app_private.has_role(auth.uid(),'admin')
       or app_private.has_role(auth.uid(),'manager')
       or app_private.has_role(auth.uid(),'sales')) then
    raise exception 'forbidden';
  end if;
  for rec in select * from jsonb_to_recordset(p_updates) as x(id uuid, stage_id uuid, "position" int) loop
    update public.leads set stage_id = rec.stage_id, position = rec.position where id = rec.id;
  end loop;
end $$;
grant execute on function public.reorder_leads(jsonb) to authenticated;

-- A5) Atomaire fase-verplaatsing (swap met buur) — geen race tussen 2 writes.
create or replace function public.move_stage(p_id uuid, p_dir int)
returns void language plpgsql security definer set search_path = public as $$
declare cur record; nb record;
begin
  if not (app_private.has_role(auth.uid(),'admin')
       or app_private.has_role(auth.uid(),'manager')
       or app_private.has_role(auth.uid(),'sales')) then
    raise exception 'forbidden';
  end if;
  select * into cur from public.lead_stages where id = p_id;
  if not found then return; end if;
  if p_dir < 0 then
    select * into nb from public.lead_stages
      where organization_id = cur.organization_id and position < cur.position
      order by position desc limit 1;
  else
    select * into nb from public.lead_stages
      where organization_id = cur.organization_id and position > cur.position
      order by position asc limit 1;
  end if;
  if not found then return; end if;
  update public.lead_stages set position = nb.position where id = cur.id;
  update public.lead_stages set position = cur.position where id = nb.id;
end $$;
grant execute on function public.move_stage(uuid, int) to authenticated;

-- Backfill won_at voor bestaande gewonnen leads.
update public.leads l set won_at = coalesce(l.won_at, l.updated_at)
from public.lead_stages s
where l.stage_id = s.id and s.is_won and l.won_at is null;
