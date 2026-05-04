import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RoadApiError, clientFromOrg, RoadClient, corsHeaders } from "./road-api.ts";

// Cron-skeleton: pollt Road voor sessies + EVSE-status en upsert in Supabase.
// In V1: dry-run counts + log naar eflux_sync_log. Volledige upsert-logica
// komt in branch `feat/eflux-sync-live`.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("eflux_api_key, eflux_provider_id, eflux_master_account_id")
      .limit(1)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return json({ status: "error", message: "Organisatie niet gevonden" }, 404);

    const client = clientFromOrg(org);
    if (!client) {
      await logSync(supabase, "config", "failed", 0, "eflux niet geconfigureerd");
      return json({ status: "not_configured", message: "Vul eflux_api_key en eflux_provider_id in" });
    }

    const sessionsResult = await syncSessions(client, supabase);
    const evsesResult = await syncEvseStatus(client, supabase);

    return json({
      status: "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
      sessions: sessionsResult,
      evses: evsesResult,
    });
  } catch (err) {
    if (err instanceof RoadApiError) {
      await logSync(supabase, "sync", "failed", 0, `Road ${err.status}: ${err.message}`);
      return json({ status: "road_error", statusCode: err.status, message: err.message });
    }
    const msg = (err as Error).message ?? "Onbekende fout";
    await logSync(supabase, "sync", "failed", 0, msg);
    return json({ status: "error", message: msg }, 500);
  }
});

async function syncSessions(client: RoadClient, supabase: any) {
  const lastSync = await getLastSync(supabase, "cpo_sessions");
  const result = await client.searchCpoSessions({
    limit: 500,
    endedAt: lastSync ? { $gte: lastSync } : undefined,
  });

  await logSync(supabase, "cpo_sessions", "success", result.data.length);
  return { fetched: result.data.length, total: result.meta.total, processed: 0 };
}

async function syncEvseStatus(client: RoadClient, supabase: any) {
  const result = await client.searchEvseControllers({ limit: 200 });
  await logSync(supabase, "evse_controllers", "success", result.data.length);
  return { fetched: result.data.length, total: result.meta.total, processed: 0 };
}

async function getLastSync(supabase: any, entityType: string): Promise<string | null> {
  const { data } = await supabase
    .from("eflux_sync_log")
    .select("last_synced_at")
    .eq("entity_type", entityType)
    .eq("status", "success")
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

async function logSync(
  supabase: any,
  entityType: string,
  status: "running" | "success" | "failed" | "pending",
  recordsSynced: number,
  errorMessage?: string,
) {
  await supabase.from("eflux_sync_log").insert({
    entity_type: entityType,
    status,
    records_synced: recordsSynced,
    last_synced_at: status === "success" ? new Date().toISOString() : null,
    error_message: errorMessage ?? null,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
