import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { defaultConfiguratorSettings } from "../_shared/configurator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;
    if (!auth.userId || (auth.role !== "admin" && auth.role !== "manager")) {
      return json({ status: "forbidden", message: "Alleen admin/manager mag configuraties starten" }, 403);
    }

    const { data: org, error: orgError } = await serviceClient
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (orgError) throw orgError;
    if (!org) return json({ status: "error", message: "Organisatie ontbreekt" }, 400);

    const settingsResult = await serviceClient
      .from("configurator_settings")
      .select("id, version")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .maybeSingle();

    if (settingsResult.error) throw settingsResult.error;
    let settings = settingsResult.data;

    if (!settings) {
      const { data: created, error: createSettingsError } = await serviceClient
        .from("configurator_settings")
        .insert({
          organization_id: org.id,
          version: 1,
          settings: defaultConfiguratorSettings,
          is_active: true,
          created_by: auth.userId,
        })
        .select("id, version")
        .single();

      if (createSettingsError) throw createSettingsError;
      settings = created;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: session, error: sessionError } = await serviceClient
      .from("configurator_sessions")
      .insert({
        organization_id: org.id,
        actor_user_id: auth.userId,
        settings_id: settings.id,
        settings_version: settings.version,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();

    if (sessionError) throw sessionError;

    const appUrl = (Deno.env.get("CONFIGURATOR_APP_URL") ?? "http://localhost:8081").replace(/\/+$/, "");
    const url = `${appUrl}/s/${session.id}/stap/1`;
    const cookieDomain = Deno.env.get("CONFIGURATOR_COOKIE_DOMAIN");
    const cookieHeaders: Record<string, string> = {};

    if (cookieDomain) {
      cookieHeaders["Set-Cookie"] = [
        `echarging_configurator_session=${session.id}`,
        "Path=/",
        `Domain=${cookieDomain}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Max-Age=900",
      ].join("; ");
    }

    return json({ sessionId: session.id, url, expiresAt: session.expires_at }, 200, cookieHeaders);
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : "Configuratiesessie starten mislukt" }, 500);
  }
});
