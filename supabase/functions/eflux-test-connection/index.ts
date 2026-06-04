import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { RoadApiError, RoadClient, clientFromEnvAndOrg, corsHeaders } from "./road-api.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const { data: org, error } = await supabase
      .from("organizations")
      .select("eflux_provider_id")
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const client = clientFromEnvAndOrg(org ?? {});
    if (!client) {
      return json({
        status: "not_configured",
        message: "EFLUX_API_KEY of Road Provider ID ontbreekt",
      });
    }

    const credentials = await client.rawRequest("GET", "/1/credentials/self");
    const counts = {
      chargePoints: await safeCount(client, "/1/evse-controllers/search/fast"),
      sessions: await safeCount(client, "/2/sessions/cpo/search/fast"),
      invoices: await safeCount(client, "/1/invoices/search/fast"),
    };

    return json({
      status: "ok",
      message: "Verbinding met Road platform werkt",
      credential: {
        name: credentials?.name ?? null,
        type: credentials?.type ?? null,
        disabled: Boolean(credentials?.disabled),
      },
      grantedCount: Array.isArray(credentials?.permissions) ? credentials.permissions.length : undefined,
      counts,
    });
  } catch (err) {
    if (err instanceof RoadApiError) {
      return json({
        status: "road_error",
        statusCode: err.status,
        message: err.message,
      });
    }
    return json({
      status: "error",
      message: (err as Error).message ?? "Onbekende fout",
    }, 500);
  }
});

async function safeCount(client: RoadClient, path: string) {
  try {
    const response = await client.rawRequest("POST", path, { limit: 1 });
    return {
      count: response?.meta?.total ?? response?.meta?.approx ?? (Array.isArray(response?.data) ? response.data.length : null),
    };
  } catch (err) {
    return {
      count: null,
      error: err instanceof RoadApiError ? `Road ${err.status}` : "error",
    };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
