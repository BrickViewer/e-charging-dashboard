-- Remove legacy public helper RPCs now that policies and SECURITY DEFINER
-- functions use app_private helpers. This keeps role/client metadata helpers
-- out of the public PostgREST RPC surface.

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_internal(uuid);
DROP FUNCTION IF EXISTS public.get_client_id_for_user(uuid);
