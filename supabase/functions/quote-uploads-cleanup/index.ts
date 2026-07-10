/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";

// quote-uploads-cleanup: verwijdert wees-bestanden uit de privé-bucket intake-uploads.
// Een bezoeker van /offerte kan een foto toevoegen en daarna toch niet versturen (of hem
// weer weghalen); de signed upload URL geeft geen deleterecht, dus zulke bestanden blijven
// als persoonsgegevens staan. Deze functie ruimt alles op wat ouder is dan N dagen en
// nergens in quote_requests.files voorkomt.
//
// Dagelijks aangeroepen door pg_cron via invoke_edge_function (x-internal-secret).
// verify_jwt = false; de secret-check zit in requireAdminOrInternal.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "intake-uploads";
const DEFAULT_DAYS = 30;
const BATCH = 100; // storage.remove aankan in één keer

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as any));
    const days = Number.isInteger(body.older_than_days) && body.older_than_days >= 0 ? body.older_than_days : DEFAULT_DAYS;

    const { data, error } = await sb.rpc("quote_intake_orphan_paths", { older_than_days: days });
    if (error) throw error;

    const paths = ((data ?? []) as string[]).filter((p) => typeof p === "string" && p.startsWith("qi/"));
    if (paths.length === 0) return json({ status: "ok", removed: 0, days });

    let removed = 0;
    for (let i = 0; i < paths.length; i += BATCH) {
      const chunk = paths.slice(i, i + BATCH);
      const { error: rmError } = await sb.storage.from(BUCKET).remove(chunk);
      if (rmError) {
        console.error("quote-uploads-cleanup: remove faalde:", rmError.message);
        continue;
      }
      removed += chunk.length;
    }

    console.log(`quote-uploads-cleanup: ${removed} wees-bestand(en) verwijderd (ouder dan ${days} dagen)`);
    return json({ status: "ok", removed, days });
  } catch (err) {
    console.error("quote-uploads-cleanup failed:", err instanceof Error ? err.message : err);
    return json({ status: "error", message: "Opruimen mislukt" }, 500);
  }
});
