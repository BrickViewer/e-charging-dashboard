-- Defense in depth: accept_client_invitation is a service-role-only helper for
-- the public Edge Function. Enforce that invariant inside the function, so a
-- future or implicit EXECUTE grant cannot let anon/authenticated callers claim
-- invitations directly with a stored token hash.

CREATE OR REPLACE FUNCTION public.accept_client_invitation(invitation_token_hash text, accepted_user_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  client_id uuid,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation public.client_invitations%ROWTYPE;
  v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'accept_client_invitation mag alleen door service-role worden uitgevoerd'
      USING ERRCODE = '42501';
  END IF;

  SELECT ci.* INTO v_invitation
  FROM public.client_invitations ci
  WHERE ci.token_hash = $1
    AND ci.status = 'pending'
    AND ci.expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Uitnodiging niet geldig of verlopen' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.clients c
  SET portal_user_id = $2,
      updated_at = now()
  WHERE c.id = v_invitation.client_id
    AND c.portal_user_id IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Klant heeft al een actief portal-account' USING ERRCODE = '23505';
  END IF;

  UPDATE public.client_invitations ci
  SET status = 'accepted',
      accepted_at = now()
  WHERE ci.id = v_invitation.id;

  UPDATE public.client_invitations ci
  SET status = 'revoked'
  WHERE ci.client_id = v_invitation.client_id
    AND ci.status = 'pending'
    AND ci.id <> v_invitation.id;

  INSERT INTO public.activity_log (client_id, user_id, action, description, metadata)
  VALUES (
    v_invitation.client_id,
    $2,
    'invitation_accepted',
    'Klant heeft uitnodiging geaccepteerd en account aangemaakt',
    jsonb_build_object('invitation_id', v_invitation.id, 'email', v_invitation.email)
  );

  RETURN QUERY SELECT v_invitation.id, v_invitation.client_id, v_invitation.email;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_client_invitation(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_client_invitation(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.accept_client_invitation(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_client_invitation(text, uuid) TO service_role;
