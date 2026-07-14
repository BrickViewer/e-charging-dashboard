-- Takenmodule -> volwaardige taakbeheerder: omschrijving, prioriteit, herhaling,
-- checklist (jsonb) en wijzigings-tracking op lead_tasks. Herhaling loopt via een
-- BEFORE-trigger zodat elke schrijver (UI, toekomstige callers) hetzelfde gedrag
-- krijgt en het afvinken + de vervolgtaak atomair zijn.

alter table public.lead_tasks
  add column if not exists description text,
  add column if not exists priority text not null default 'medium'
    constraint lead_tasks_priority_check check (priority in ('high','medium','low')),
  add column if not exists recurrence text
    constraint lead_tasks_recurrence_check check (recurrence in ('daily','weekly','monthly')),
  add column if not exists checklist jsonb not null default '[]'::jsonb
    constraint lead_tasks_checklist_check check (jsonb_typeof(checklist) = 'array'),
  add column if not exists recurred_at timestamptz,
  add column if not exists parent_task_id uuid references public.lead_tasks(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Backstop tegen dubbele vervolgtaken: een taak kan maximaal één opvolger hebben.
create unique index if not exists lead_tasks_parent_once_uq
  on public.lead_tasks(parent_task_id) where parent_task_id is not null;

drop trigger if exists lead_tasks_touch_updated_at on public.lead_tasks;
create trigger lead_tasks_touch_updated_at
  before update on public.lead_tasks
  for each row execute function public.update_updated_at_column();

-- Volgende vervaldatum: kleinste k>=1 waarvoor basis + k*interval >= p_today.
-- Maandelijks telt vanaf de ORIGINELE basis (31 jan -> 28 feb -> 31 mrt, geen
-- maandeinde-drift). TS-tweeling: apps/admin/src/services/tasks.ts nextOccurrence
-- — wijzigingen hier ook daar doorvoeren.
create or replace function public.lead_task_next_due(p_base date, p_recurrence text, p_today date default current_date)
returns date
language plpgsql
immutable
as $$
declare
  k integer;
  result date;
begin
  if p_base is null or p_today is null then
    return null;
  end if;
  if p_recurrence = 'daily' then
    return p_base + greatest(1, p_today - p_base);
  elsif p_recurrence = 'weekly' then
    return p_base + 7 * greatest(1, ceil((p_today - p_base) / 7.0)::int);
  elsif p_recurrence = 'monthly' then
    k := 1;
    loop
      result := (p_base + make_interval(months => k))::date;
      exit when result >= p_today or k > 1200;
      k := k + 1;
    end loop;
    return result;
  end if;
  return null;
end $$;

-- Bij afvinken van een terugkerende taak: één vervolgtaak aanmaken (checklist
-- gereset, zelfde eigenaar/prioriteit/lead). Idempotent: recurred_at-guard (blijft
-- staan bij uitvinken + opnieuw afvinken) + unique index-backstop hierboven.
create or replace function public.tg_lead_task_recur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.done and not OLD.done and NEW.recurrence is not null and NEW.recurred_at is null then
    begin
      insert into public.lead_tasks
        (lead_id, organization_id, title, description, priority, recurrence, assigned_to,
         due_date, position, created_by, parent_task_id, checklist)
      values
        (NEW.lead_id, NEW.organization_id, NEW.title, NEW.description, NEW.priority, NEW.recurrence,
         NEW.assigned_to,
         public.lead_task_next_due(coalesce(NEW.due_date, current_date), NEW.recurrence),
         NEW.position, NEW.created_by, NEW.id,
         (select coalesce(jsonb_agg(jsonb_set(i, '{done}', 'false'::jsonb)), '[]'::jsonb)
            from jsonb_array_elements(NEW.checklist) as i));
      NEW.recurred_at := now();
    exception when unique_violation then
      -- Race met een tweede afvink-update: opvolger bestaat al, toggle mag niet falen.
      NEW.recurred_at := coalesce(NEW.recurred_at, now());
    end;
  end if;
  return NEW;
end $$;

drop trigger if exists lead_task_recur on public.lead_tasks;
create trigger lead_task_recur
  before update of done on public.lead_tasks
  for each row execute function public.tg_lead_task_recur();

-- Toewijzingsmail: automatische recurrence-kopieën mailen nooit (de eigenaar
-- vinkte zelf af of wist ervan); alleen expliciete (her)toewijzing mailt.
create or replace function public.tg_lead_task_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.assigned_to is not null
     and not (TG_OP = 'INSERT' and NEW.parent_task_id is not null)
     and (TG_OP = 'INSERT' or NEW.assigned_to is distinct from OLD.assigned_to)
     and NEW.assigned_to <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  then
    perform public.invoke_edge_function('task-notify', jsonb_build_object('task_id', NEW.id));
  end if;
  return NEW;
end $$;
