-- Taken uitbreiden: losse to-do's (lead optioneel), indexen voor het overzicht, en een e-mailmelding bij
-- toewijzing aan een ander (via invoke_edge_function -> edge task-notify). Additief; bestaande takenflow blijft.

alter table public.lead_tasks alter column lead_id drop not null;

create index if not exists lead_tasks_assigned_idx on public.lead_tasks(assigned_to, done);
create index if not exists lead_tasks_org_done_due_idx on public.lead_tasks(organization_id, done, due_date);

-- Meld de toegewezene per e-mail wanneer een taak aan een ander wordt (her)toegewezen. Niet bij zelf-toewijzen,
-- niet bij afvinken/titel-edit (assigned_to ongewijzigd), niet bij auto-stage-taken (assigned_to null).
create or replace function public.tg_lead_task_notify() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if NEW.assigned_to is not null
     and (TG_OP = 'INSERT' or NEW.assigned_to is distinct from OLD.assigned_to)
     and NEW.assigned_to <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  then
    perform public.invoke_edge_function('task-notify', jsonb_build_object('task_id', NEW.id));
  end if;
  return NEW;
end $$;

drop trigger if exists lead_task_notify on public.lead_tasks;
create trigger lead_task_notify after insert or update on public.lead_tasks
  for each row execute function public.tg_lead_task_notify();
