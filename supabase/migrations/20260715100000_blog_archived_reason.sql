-- Concept-hygiëne voor de blogmachine: terminaal afgekeurde machine-blogs horen niet als los
-- concept in de review-lijst te blijven slingeren (op 15 juli 2026 stonden er 3 naast elkaar,
-- waarvan één off-brand). De keten archiveert voortaan zelf (content-factcheck/content-revise);
-- deze migratie voegt de reden-kolom toe en ruimt de bestaande gestrande concepten eenmalig op.
-- Terugzetten en zelf publiceren kan altijd via de blog-editor (status-veld).

alter table public.blog_posts add column if not exists archived_reason text;

-- Eenmalige opschoning. Terminaliteit keyen op de HARDE signalen (revise-rondes vol of
-- feitencontrole 2× gefaald), NIET op review_state alleen: content_ingest_draft zet
-- 'changes_requested' ook op verse, nog lopende drafts met lage eerste-audit-scores.
update public.blog_posts
set status = 'gearchiveerd',
    archived_reason = 'Terminaal afgekeurd door de blogmachine (opschoning 15 juli 2026): '
      || case
           when (factcheck->>'verdict') = 'fail' and coalesce((factcheck->>'round')::int, 0) >= 2
             then 'feitencontrole blokkeerde publicatie'
           else 'kwaliteit haalde de lat niet na het maximale aantal revisierondes'
         end
where status = 'concept'
  and generated_by like 'agent:%'
  and review_state = 'changes_requested'
  and (
    coalesce(revise_count, 0) >= 4
    or ((factcheck->>'verdict') = 'fail' and coalesce((factcheck->>'round')::int, 0) >= 2)
  );
