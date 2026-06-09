-- Ondertekening van offertes + opslag van de getekende PDF.
alter table public.quotes add column if not exists signer_name text;
alter table public.quotes add column if not exists signed_pdf_path text;

insert into storage.buckets (id, name, public) values ('quote-documents','quote-documents', false)
  on conflict (id) do nothing;
drop policy if exists "Internal read quote-documents" on storage.objects;
create policy "Internal read quote-documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'quote-documents' and (app_private.has_role(auth.uid(),'admin') or app_private.has_role(auth.uid(),'manager') or app_private.has_role(auth.uid(),'sales')));
