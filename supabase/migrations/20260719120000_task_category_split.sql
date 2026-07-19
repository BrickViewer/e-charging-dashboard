-- Takensplit: taken krijgen een categorie zodat het directie-werkblad (/admin/taken)
-- alles toont en /sales/taken alleen sales-taken. Lead-gebonden taken zijn per
-- definitie sales; standalone taken kunnen 'algemeen' zijn (bv. ERE-aanvragen).

alter table public.lead_tasks
  add column if not exists category text not null default 'sales'
    check (category in ('sales', 'algemeen'));

-- Lead-gebonden taken zijn altijd sales (het sales-werkblad blijft compleet).
alter table public.lead_tasks
  drop constraint if exists lead_tasks_lead_implies_sales;
alter table public.lead_tasks
  add constraint lead_tasks_lead_implies_sales
    check (lead_id is null or category = 'sales');

-- Backfill: de bestaande standalone ERE-aanvraagtaken zijn algemene bedrijfstaken.
update public.lead_tasks
   set category = 'algemeen'
 where lead_id is null
   and title like 'Klant % wil ERE-certificaten aanmelden';

create index if not exists lead_tasks_org_category_done_idx
  on public.lead_tasks (organization_id, category, done);

-- ERE-trigger: nieuwe aanvraagtaken landen voortaan als 'algemeen' (directie-lijst).
create or replace function public.tg_ere_notify_request()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  if NEW.calculate_ere_enabled is true
     and (TG_OP = 'INSERT' or OLD.calculate_ere_enabled is distinct from true)
     and auth.uid() is not null
     and auth.uid() = NEW.portal_user_id
  then
    begin
      perform public.invoke_edge_function('ere-request-notify', jsonb_build_object('client_id', NEW.id));
      insert into public.lead_tasks (organization_id, title, lead_id, category)
      values (
        NEW.organization_id,
        'Klant ' || coalesce(nullif(trim(NEW.company_name), ''), '(zonder naam)') || ' wil ERE-certificaten aanmelden',
        null,
        'algemeen'
      );
    exception when others then
      raise warning 'ERE-notify faalde voor client %: %', NEW.id, sqlerrm;
    end;
  end if;
  return NEW;
end $$;

-- Recur-trigger: de opvolger erft de categorie van de bron-taak.
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
         due_date, position, created_by, parent_task_id, checklist, category)
      values
        (NEW.lead_id, NEW.organization_id, NEW.title, NEW.description, NEW.priority, NEW.recurrence,
         NEW.assigned_to,
         public.lead_task_next_due(coalesce(NEW.due_date, current_date), NEW.recurrence),
         NEW.position, NEW.created_by, NEW.id,
         (select coalesce(jsonb_agg(jsonb_set(i, '{done}', 'false'::jsonb)), '[]'::jsonb)
            from jsonb_array_elements(NEW.checklist) as i),
         NEW.category);
      NEW.recurred_at := now();
    exception when unique_violation then
      -- Race met een tweede afvink-update: opvolger bestaat al, toggle mag niet falen.
      NEW.recurred_at := coalesce(NEW.recurred_at, now());
    end;
  end if;
  return NEW;
end $$;
