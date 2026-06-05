-- Sales mag klanten en offertes beheren (schrijven). Lezen loopt al via de
-- bestaande "Internal users can view ..."-policies (app_private.is_internal).
drop policy if exists "Sales can manage clients" on public.clients;
create policy "Sales can manage clients" on public.clients
  for all to authenticated
  using (app_private.has_role(auth.uid(), 'sales'))
  with check (app_private.has_role(auth.uid(), 'sales'));

drop policy if exists "Sales can manage quotes" on public.quotes;
create policy "Sales can manage quotes" on public.quotes
  for all to authenticated
  using (app_private.has_role(auth.uid(), 'sales'))
  with check (app_private.has_role(auth.uid(), 'sales'));
