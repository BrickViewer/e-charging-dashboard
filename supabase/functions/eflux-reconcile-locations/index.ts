import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// eflux-reconcile-locations — verbergt locaties die in e-Flux zijn verwijderd.
// DB-gedreven signaal: de reguliere eflux-sync spiegelt Road's staat naar charge_points. Een in
// e-Flux verwijderd laadpunt krijgt operational_status='archived' (Road verwijdert de EVSE niet,
// maar archiveert 'm). Een locatie is dus "levend" zolang ze >=1 laadpunt heeft dat NIET 'archived'
// is. Locaties zonder (actief) laadpunt — lege hulzen of alleen archived-laadpunten — worden
// verborgen via locations.archived_at (omkeerbaar: komt er weer een actief laadpunt bij → automatisch
// weer zichtbaar). GUARD: als er 0 actieve laadpunten in de hele DB zijn (data ziet er kapot uit) →
// niets doen. Auth: interne aanroep via x-internal-secret (cron via public.invoke_edge_function).

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
    // 1. Actieve laadpunten → set van "levende" location_ids (operational_status ≠ 'archived'; NULL telt als actief).
    const { data: cps, error: cpErr } = await supabase
      .from("charge_points")
      .select("location_id, operational_status");
    if (cpErr) throw cpErr;

    const activeLoc = new Set<string>();
    for (const cp of cps ?? []) {
      if (cp.location_id && cp.operational_status !== "archived") activeLoc.add(cp.location_id as string);
    }

    // GUARD: geen enkel actief laadpunt → data verdacht → niets archiveren.
    if (activeLoc.size === 0) {
      return json({ status: "skipped", reason: "geen actieve laadpunten in DB", active_locations: 0 });
    }

    // 2. Onze e-Flux-locaties (handmatige locaties zonder eflux_location_id blijven ongemoeid).
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, archived_at")
      .not("eflux_location_id", "is", null);
    if (locErr) throw locErr;

    const nowIso = new Date().toISOString();
    const toArchive: string[] = [];
    const toUnarchive: string[] = [];
    for (const l of locs ?? []) {
      const alive = activeLoc.has(l.id as string);
      if (alive && l.archived_at !== null) toUnarchive.push(l.id as string);
      else if (!alive && l.archived_at === null) toArchive.push(l.id as string);
    }

    if (toArchive.length) {
      const { error } = await supabase.from("locations")
        .update({ archived_at: nowIso, road_synced_at: nowIso }).in("id", toArchive);
      if (error) throw error;
    }
    if (toUnarchive.length) {
      const { error } = await supabase.from("locations")
        .update({ archived_at: null, road_synced_at: nowIso }).in("id", toUnarchive);
      if (error) throw error;
    }

    return json({
      status: "ok",
      active_locations: activeLoc.size,
      archived: toArchive.length,
      unarchived: toUnarchive.length,
    });
  } catch (err) {
    console.error("eflux-reconcile-locations failed:", (err as Error).message);
    return json({ status: "error", message: (err as Error).message }, 500);
  }
});
