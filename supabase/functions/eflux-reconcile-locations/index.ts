import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// eflux-reconcile-locations — ruimt locaties op die in e-Flux/Road zijn verwijderd.
// De reguliere eflux-sync is upsert-only (verwijdert nooit); deze job reconcilieert:
//   - locaties die Road nog kent (via de EVSE-set) → road_synced_at bijwerken + de-archiveren;
//   - locaties zonder laadpunt (niet meer in de EVSE-set) → VERBERGEN (archiveren, omkeerbaar):
//       de huls kan in Road nog bestaan (200) nadat het laadpunt is verwijderd — die verbergen we ook;
//       is de locatie in Road volledig weg (404) én heeft ze geen klant/laadpunt/sessie → hard delete.
//     Komt er later weer een laadpunt bij → de locatie zit weer in de EVSE-set en wordt automatisch
//     ge-de-archiveerd (archived_at terug naar null).
// GUARD: bij een lege EVSE-fetch (mogelijke misconfig) wordt NIETS gearchiveerd/verwijderd.
// Auth: interne aanroep via x-internal-secret (zoals cron via public.invoke_edge_function).

const ROAD_BASE = "https://api.road.io";
const PAGE = 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-internal-secret, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (!internalSecret || req.headers.get("x-internal-secret") !== internalSecret) {
    return json({ status: "error", message: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("eflux_provider_id, eflux_master_account_id")
      .limit(1)
      .maybeSingle();
    if (orgErr) throw orgErr;

    const apiKey = Deno.env.get("EFLUX_API_KEY");
    if (!org?.eflux_provider_id || !apiKey) {
      return json({ status: "not_configured", message: "EFLUX_API_KEY of eflux_provider_id ontbreekt" });
    }
    const accountId = (org.eflux_master_account_id as string | null) ?? undefined;
    const roadHeaders: Record<string, string> = {
      "Authorization": `Bearer ${apiKey}`,
      "Provider": org.eflux_provider_id as string,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    // 1. Alle EVSE-controllers ophalen → set van locatie-ids die Road nu kent.
    const seen = new Set<string>();
    let skip = 0;
    while (true) {
      const res = await fetch(`${ROAD_BASE}/1/evse-controllers/search/fast`, {
        method: "POST", headers: roadHeaders,
        body: JSON.stringify({ accountId, limit: PAGE, skip }),
      });
      if (!res.ok) throw new Error(`Road evse-controllers search faalde: ${res.status}`);
      const payload = await res.json();
      const rows: Array<{ locationId?: string }> = payload?.data ?? [];
      for (const r of rows) if (r.locationId) seen.add(r.locationId);
      if (rows.length < PAGE) break;
      skip += PAGE;
      if (skip > 50_000) break;
    }

    // GUARD: lege fetch → nooit alles archiveren.
    if (seen.size === 0) return json({ status: "skipped", reason: "geen locaties in Road-fetch", seen: 0 });

    const nowIso = new Date().toISOString();
    const seenIds = [...seen];

    // 2. Geziene locaties: vers gesynct + de-archiveren (re-appear in e-Flux).
    await supabase.from("locations").update({ road_synced_at: nowIso, archived_at: null }).in("eflux_location_id", seenIds);

    // 3. Kandidaten: onze e-Flux-locaties die niet meer in de Road-set zitten.
    const { data: ourLocs, error: ourErr } = await supabase
      .from("locations").select("id, eflux_location_id, client_id").not("eflux_location_id", "is", null);
    if (ourErr) throw ourErr;

    let archived = 0, deleted = 0, skipped = 0;
    for (const loc of ourLocs ?? []) {
      const efluxId = loc.eflux_location_id as string;
      if (seen.has(efluxId)) continue; // heeft laadpunt(en) in Road → live, laten staan

      // Geen laadpunt (meer) in Road. Bestaat de huls nog? 404 = volledig weg.
      const res = await fetch(`${ROAD_BASE}/1/locations/${efluxId}`, { method: "GET", headers: roadHeaders });
      const gone = res.status === 404;
      if (!res.ok && !gone) { skipped++; continue; } // onbekende fout → met rust laten

      const [{ count: cpCount }, { count: sessCount }] = await Promise.all([
        supabase.from("charge_points").select("id", { count: "exact", head: true }).eq("location_id", loc.id),
        supabase.from("charging_sessions").select("id", { count: "exact", head: true }).eq("location_id", loc.id),
      ]);
      const noData = !loc.client_id && (cpCount ?? 0) === 0 && (sessCount ?? 0) === 0;

      if (gone && noData) {
        // Volledig verwijderd in Road én geen data → hard delete.
        const { error } = await supabase.from("locations").delete().eq("id", loc.id);
        if (!error) deleted++; else console.error(`hard-delete ${loc.id} faalde:`, error.message);
      } else {
        // Geen laadpunt → verbergen (omkeerbaar). road_synced_at bijwerken als de huls nog bestaat.
        const patch: Record<string, unknown> = { archived_at: nowIso };
        if (!gone) patch.road_synced_at = nowIso;
        const { error } = await supabase.from("locations").update(patch).eq("id", loc.id);
        if (!error) archived++; else console.error(`archive ${loc.id} faalde:`, error.message);
      }
    }

    return json({ status: "ok", seen: seen.size, archived, deleted, skipped });
  } catch (err) {
    console.error("eflux-reconcile-locations failed:", (err as Error).message);
    return json({ status: "error", message: (err as Error).message }, 500);
  }
});
