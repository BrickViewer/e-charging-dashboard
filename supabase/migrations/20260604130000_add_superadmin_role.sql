-- Voeg de 'superadmin'-rol toe aan de app_role enum.
-- Moet in een eigen migratie/transactie: een nieuw toegevoegde enum-waarde
-- mag niet in dezelfde transactie gebruikt worden. De hiërarchie-logica
-- (helper, RLS, trigger) staat daarom in de volgende migratie.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';
