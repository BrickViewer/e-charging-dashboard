import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RoadApiError, clientFromOrg, corsHeaders } from "./road-api.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: org, error } = await supabase
      .from("organizations")
      .select("eflux_api_key, eflux_provider_id, eflux_master_account_id")
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!org) {
      return json({ status: "error", message: "Organisatie niet gevonden" }, 404);
    }

    const client = clientFromOrg(org);
    if (!client) {
      return json({
        status: "not_configured",
        message: "Vul eerst eflux_api_key en eflux_provider_id in via de instellingen.",
        hasApiKey: !!org.eflux_api_key,
        hasProviderId: !!org.eflux_provider_id,
      });
    }

    const credentials = await client.getCredentialsSelf();

    return json({
      status: "ok",
      message: "Verbinding met Road platform werkt",
      credentials: {
        id: credentials.id,
        type: credentials.type,
        providerId: credentials.providerId,
        accountId: credentials.accountId,
        permissionsCount: credentials.permissions?.length ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof RoadApiError) {
      return json({
        status: "road_error",
        statusCode: err.status,
        message: err.message,
        details: err.payload.details,
      });
    }
    return json({
      status: "error",
      message: (err as Error).message ?? "Onbekende fout",
    }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
