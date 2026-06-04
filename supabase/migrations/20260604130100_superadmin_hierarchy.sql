-- Superadmin-hiërarchie: helper, dichtgezette user_roles-RLS en DB-bescherming.
--
-- Ontwerp: de superadmin houdt óók de 'admin'-rol, zodat alle bestaande
-- admin/manager-RLS ongewijzigd blijft werken. De 'superadmin'-rol is puur
-- de markering voor (a) het exclusieve recht om interne gebruikers te beheren
-- en (b) bescherming tegen verwijderen/degraderen.

-- 1) Helper: is deze gebruiker superadmin? (zelfde patroon als has_role/is_internal)
CREATE OR REPLACE FUNCTION app_private.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;
GRANT EXECUTE ON FUNCTION app_private.is_superadmin(uuid) TO authenticated;

-- 2) Gat dichten op user_roles.
--    Voorheen mocht ELKE admin rollen muteren (en zichzelf dus superadmin maken).
--    Vanaf nu: alleen de superadmin muteert rollen vanaf de client; edge functions
--    gebruiken de service-role en omzeilen RLS gecontroleerd.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Superadmins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (app_private.is_superadmin(auth.uid()))
  WITH CHECK (app_private.is_superadmin(auth.uid()));

-- Interne gebruikers (admin/manager/viewer/superadmin) mogen rollen lezen,
-- zodat de teamledenlijst in de UI blijft werken. (Mutatie blijft superadmin-only.)
CREATE POLICY "Internal users can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (app_private.is_internal(auth.uid()));
-- "Users can view own role" blijft bestaan (onschadelijk, dekt eigen rol).

-- 3) DB-bescherming: de superadmin-rol kan niet vanaf de client worden verwijderd
--    of gedegradeerd, en de laatste superadmin kan sowieso niet weg (ook niet via
--    service-role / cascade bij accountverwijdering).
CREATE OR REPLACE FUNCTION app_private.protect_superadmin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_superadmins int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'superadmin' THEN
      IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'De superadmin-rol kan niet worden verwijderd'
          USING ERRCODE = '42501';
      END IF;
      SELECT count(DISTINCT user_id) INTO v_other_superadmins
      FROM public.user_roles
      WHERE role = 'superadmin' AND user_id <> OLD.user_id;
      IF v_other_superadmins = 0 THEN
        RAISE EXCEPTION 'De laatste superadmin kan niet worden verwijderd'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'superadmin' AND NEW.role IS DISTINCT FROM 'superadmin' THEN
      RAISE EXCEPTION 'De superadmin-rol kan niet worden gewijzigd'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_superadmin ON public.user_roles;
CREATE TRIGGER trg_protect_superadmin
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_superadmin();
