import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { GraphClient, sanitizeName } from "../_shared/sharepoint.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// Cron-functie: uploadt getekende offertes (OPD) die nog niet in SharePoint staan,
// vanuit de Supabase-storage naar de Opdracht-submap. Alleen via x-internal-secret.

const corsHeaders = CORS_INTERNAL;
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
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: true });
    if (!auth.ok) return auth.response;
    if (auth.kind !== "internal") return json({ status: "forbidden", message: "Alleen interne aanroep" }, 403);

    const spTenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
    const spClient = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
    const spSecret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
    const gc = (spTenant && spClient && spSecret) ? new GraphClient(spTenant, spClient, spSecret) : null;
    if (!gc) return json({ status: "ok", skipped: "not_configured" });

    // Kandidaten: getekend, nog geen OPD in SharePoint, wel een getekende PDF in storage + een dossier.
    const { data: quotes, error: qErr } = await sb.from("quotes")
      .select("id, quote_number, signed_pdf_path, document_number, sent_at, organization_id, project_location_id, prospect_company")
      .eq("status", "getekend")
      .is("opd_item_id", null)
      .not("signed_pdf_path", "is", null)
      .not("project_location_id", "is", null)
      .order("signed_at", { ascending: true })
      .limit(20);
    if (qErr) throw qErr;

    let uploaded = 0, skipped = 0, failed = 0;
    for (const q of (quotes ?? [])) {
      try {
        const { data: loc } = await sb.from("project_locations")
          .select("opdracht_item_id, location_number, address_street, city").eq("id", q.project_location_id!).maybeSingle();
        if (!loc?.opdracht_item_id) { skipped++; continue; }
        const { data: org } = await sb.from("organizations").select("sharepoint_drive_id").eq("id", q.organization_id).maybeSingle();
        const driveId = org?.sharepoint_drive_id as string | null;
        if (!driveId) { skipped++; continue; }

        const { data: blob, error: dErr } = await sb.storage.from("quote-documents").download(q.signed_pdf_path!);
        if (dErr || !blob) { skipped++; continue; }
        const bytes = new Uint8Array(await blob.arrayBuffer());

        const addrLabel = [loc.address_street, loc.city].filter(Boolean).join(" ") || String(q.prospect_company ?? "");
        const opdNumber = q.quote_number ?? `${loc.location_number}-${String(q.document_number ?? 1).padStart(2, "0")}-${String(new Date(q.sent_at ?? new Date().toISOString()).getFullYear()).slice(-2)}`;
        const opdName = sanitizeName(`${opdNumber} OPD ${addrLabel}`) + ".pdf";
        const opd = await gc.uploadFile(driveId, loc.opdracht_item_id, opdName, bytes);
        // Alleen zetten als nog null (race met de directe upload in quote-accept).
        await sb.from("quotes").update({ opd_item_id: opd.id, opd_web_url: opd.webUrl }).eq("id", q.id).is("opd_item_id", null);
        uploaded++;
      } catch (e) {
        console.error("[quote-opd-sync] OPD-upload mislukt voor", q.id, e instanceof Error ? e.message : e);
        failed++;
      }
    }
    return json({ status: "ok", uploaded, skipped, failed, candidates: quotes?.length ?? 0 });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Synchronisatie mislukt" }, 500);
  }
});
