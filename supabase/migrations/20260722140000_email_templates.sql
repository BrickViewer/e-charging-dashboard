-- Instelbare e-mailsjablonen. Elke uitgaande standaardmail heeft een vast HTML-ontwerp in code;
-- via deze tabel zijn alleen de TEKSTSLOTS (onderwerp, aanhef, alinea's, knoptekst) te overschrijven.
-- De huisstijl, knopvormgeving en de on-domain afbeeldingen blijven daarmee altijd intact.
--
-- ONTBREEKT ER EEN RIJ, dan valt de code terug op de ingebouwde tekst. Zolang deze tabel leeg is
-- verandert er dus niets aan wat er verstuurd wordt — dat maakt de uitrol stapsgewijs en omkeerbaar.
--
-- Eén rij per sleutel (dus niet één jsonb-blob zoals content_engine_settings): het bewerken van
-- één mail kan dan nooit een andere raken.

-- ALLE overschrijfbare tekst zit in `slots`, ook het onderwerp. Bewust geen aparte subject-kolom:
-- meerdere mails hebben méér dan één onderwerp (de klantuitnodiging heeft een andere kop bij
-- installatie+beheer dan bij alleen-beheer), en dan zou één kolom niet volstaan.
create table if not exists public.email_templates (
  key             text primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  -- { slotnaam: tekst } — alleen slots die de gebruiker daadwerkelijk heeft overschreven
  slots           jsonb not null default '{}'::jsonb,
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

comment on table public.email_templates is
  'Overschrijft de tekstslots van uitgaande standaardmails. Geen rij of enabled=false = de tekst uit de code.';
comment on column public.email_templates.slots is
  'Alleen overschreven slots. Ontbrekende slots vallen terug op de standaardtekst in _shared/emailTemplates.ts.';

alter table public.email_templates enable row level security;

-- Intern leest mee (de editor toont de sjablonen); schrijven loopt via de RPC hieronder, die
-- valideert. Service role passeert RLS, zodat de edge functions bij het verzenden kunnen lezen.
drop policy if exists "email_templates_internal_read" on public.email_templates;
create policy "email_templates_internal_read"
  on public.email_templates for select
  using (app_private.is_internal(auth.uid()));

-- Opslaan MET servervalidatie. Client-side valideren alleen zou omzeilbaar zijn: een sjabloon
-- zonder zijn verplichte placeholders (bv. een uitnodiging zonder {{uitnodigingslink}}) levert
-- een onbruikbare mail bij de klant op. De lijst met verplichte placeholders komt mee vanuit de
-- aanroeper (die het register kent) en wordt hier hard afgedwongen.
create or replace function public.save_email_template(
  p_key      text,
  p_slots    jsonb,
  p_required text[] default '{}'::text[],
  p_enabled  boolean default true
)
returns public.email_templates
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org       uuid;
  v_haystack  text;
  v_missing   text[] := '{}';
  v_ph        text;
  v_row       public.email_templates;
begin
  if not (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    or app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) then
    raise exception 'Alleen admin/manager mag e-mailsjablonen aanpassen' using errcode = '42501';
  end if;

  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'Sjabloonsleutel ontbreekt';
  end if;

  -- Alle overschreven tekst samen: een verplichte placeholder mag in elk slot staan.
  v_haystack := coalesce((select string_agg(value, ' ') from jsonb_each_text(coalesce(p_slots, '{}'::jsonb))), '');

  foreach v_ph in array coalesce(p_required, '{}'::text[]) loop
    if position('{{' || v_ph || '}}' in v_haystack) = 0 then
      v_missing := array_append(v_missing, v_ph);
    end if;
  end loop;

  if array_length(v_missing, 1) is not null then
    raise exception 'Verplichte placeholder(s) ontbreken: %', array_to_string(v_missing, ', ')
      using errcode = 'P0001';
  end if;

  select id into v_org from public.organizations order by created_at limit 1;

  insert into public.email_templates as t (key, organization_id, slots, enabled, updated_at, updated_by)
  values (p_key, v_org, coalesce(p_slots, '{}'::jsonb), coalesce(p_enabled, true), now(), auth.uid())
  on conflict (key) do update
    set slots      = excluded.slots,
        enabled    = excluded.enabled,
        updated_at = now(),
        updated_by = auth.uid()
  returning t.* into v_row;

  insert into public.activity_log (user_id, action, description, metadata)
  values (auth.uid(), 'email_template_saved', 'E-mailsjabloon aangepast: ' || p_key,
          jsonb_build_object('key', p_key, 'enabled', coalesce(p_enabled, true)));

  return v_row;
end $$;

grant execute on function public.save_email_template(text, jsonb, text[], boolean) to authenticated;

-- Terugzetten naar de ingebouwde tekst = de rij weggooien (geen rij betekent standaard).
create or replace function public.reset_email_template(p_key text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    or app_private.has_role(auth.uid(), 'manager'::public.app_role)
  ) then
    raise exception 'Alleen admin/manager mag e-mailsjablonen aanpassen' using errcode = '42501';
  end if;
  delete from public.email_templates where key = p_key;
  insert into public.activity_log (user_id, action, description, metadata)
  values (auth.uid(), 'email_template_reset', 'E-mailsjabloon teruggezet naar standaard: ' || p_key,
          jsonb_build_object('key', p_key));
end $$;

grant execute on function public.reset_email_template(text) to authenticated;
