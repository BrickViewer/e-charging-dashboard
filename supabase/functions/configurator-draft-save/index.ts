import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

  try {
    const { data: session, error: sessionError } = await serviceClient
      .from("configurator_sessions")
      .select("id, actor_user_id, status, expires_at")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || session.status !== "active" || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ status: "forbidden", message: "Configuratiesessie verlopen" }, 403);
    }

    const now = new Date().toISOString();
    const step = Math.min(5, Math.max(1, Number(body.step ?? 1) || 1));
    const { error: upsertError } = await serviceClient
      .from("configurator_drafts")
      .upsert({
        session_id: session.id,
        actor_user_id: session.actor_user_id,
        current_step: step,
        draft: body.input ?? {},
        updated_at: now,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "session_id" });
    if (upsertError) throw upsertError;

    await serviceClient
      .from("configurator_sessions")
      .update({ last_seen_at: now })
      .eq("id", session.id);

    return json({ status: "saved", savedAt: now });
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Concept opslaan mislukt" }, 500);
  }
});
