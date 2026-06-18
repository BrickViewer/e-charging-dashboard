import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { clientFromEnv, SharepointError } from "./sharepoint.ts";

// Geeft de live bestandslijst van een SharePoint-map (voor de Documenten-tab).
// Body: { folder_item_id }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const gc = clientFromEnv();
    if (!gc) return json({ status: "not_configured", items: [] });

    const body = await req.json().catch(() => ({}));
    const folderItemId = typeof body.folder_item_id === "string" ? body.folder_item_id : "";
    if (!folderItemId) return json({ status: "error", message: "folder_item_id ontbreekt" }, 400);

    const { data: prof } = await sb.from("profiles").select("organization_id").eq("user_id", auth.userId!).maybeSingle();
    const { data: org } = await sb.from("organizations").select("sharepoint_drive_id").eq("id", prof?.organization_id ?? "").maybeSingle();
    const driveId = org?.sharepoint_drive_id as string | null;
    if (!driveId) return json({ status: "not_configured", items: [] });

    const items = await gc.listChildren(driveId, folderItemId);
    return json({ status: "ok", items });
  } catch (err) {
    if (err instanceof SharepointError) return json({ status: "sharepoint_error", statusCode: err.status, message: err.message, items: [] }, 200);
    return json({ status: "error", message: err instanceof Error ? err.message : "Ophalen mislukt", items: [] }, 500);
  }
});
