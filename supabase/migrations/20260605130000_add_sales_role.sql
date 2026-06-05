-- Nieuwe rol 'sales' voor het Sales-werkblad. Eigen migratie zodat de enum-waarde
-- gecommit is voordat policies/queries ernaar verwijzen (anders "unsafe use of new
-- enum value").
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales';
