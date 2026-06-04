import { createClient } from "jsr:@supabase/supabase-js@2";

type SupabaseService = ReturnType<typeof createClient>;

export type ClientAccess =
  | { ok: true; userId: string; role: "admin" | "manager"; clientId: string; isAdmin: true }
  | { ok: true; userId: string; role: "client"; clientId: string; isAdmin: false }
  | { ok: false; response: Response };

function jsonError(status: number, message: string, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ status: status === 401 ? "unauthorized" : "forbidden", message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function resolveClientAccess(
  req: Request,
  serviceClient: SupabaseService,
  corsHeaders: Record<string, string>,
  requestedClientId?: string,
): Promise<ClientAccess> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: jsonError(401, "Authorization header ontbreekt", corsHeaders) };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: jsonError(401, "Ongeldige sessie", corsHeaders) };
  }

  const { data: roleRow, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) throw roleError;

  const role = roleRow?.role;
  if ((role === "admin" || role === "manager") && requestedClientId) {
    return { ok: true, userId: user.id, role, clientId: requestedClientId, isAdmin: true };
  }

  if (role === "admin" || role === "manager") {
    return { ok: false, response: jsonError(400, "client_id ontbreekt voor adminactie", corsHeaders) };
  }

  const { data: client, error: clientError } = await serviceClient
    .from("clients")
    .select("id")
    .eq("portal_user_id", user.id)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!client?.id) {
    return { ok: false, response: jsonError(403, "Geen klantportaal gekoppeld aan deze gebruiker", corsHeaders) };
  }

  return { ok: true, userId: user.id, role: "client", clientId: client.id, isAdmin: false };
}
