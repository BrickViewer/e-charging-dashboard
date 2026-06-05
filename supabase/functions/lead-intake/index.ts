import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// lead-intake — publieke endpoint waar de website nieuwe leads naartoe POST't.
// Beveiliging: gedeelde sleutel in de header `x-intake-secret` (timing-safe) +
// honeypot-veld tegen bots. verify_jwt = false.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-intake-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const encoder = new TextEncoder();
function timingSafeEqual(a: string, b: string) {
  const aB = encoder.encode(a);
  const bB = encoder.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
function int(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function numv(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const expected = Deno.env.get("LEAD_INTAKE_SECRET") ?? "";
  if (!expected) return json({ status: "not_configured", message: "LEAD_INTAKE_SECRET ontbreekt" }, 500);

  const provided = req.headers.get("x-intake-secret") ?? "";
  if (!timingSafeEqual(provided, expected)) {
    return json({ status: "unauthorized", message: "Ongeldige sleutel" }, 401);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Honeypot: gevuld = bot → doe alsof het lukt, maar sla niets op.
  if (str(body.hp) || str(body.website_url_hp)) return json({ status: "ok" });

  const companyName = str(body.company_name) ?? str(body.company) ?? str(body.bedrijfsnaam);
  if (!companyName) return json({ status: "error", message: "company_name verplicht" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: org } = await supabase
      .from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!org) return json({ status: "error", message: "Geen organisatie gevonden" }, 500);

    const { data: stage } = await supabase
      .from("lead_stages").select("id").eq("organization_id", org.id)
      .order("is_default", { ascending: false }).order("position", { ascending: true }).limit(1).maybeSingle();

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        organization_id: org.id,
        stage_id: stage?.id ?? null,
        source: "website",
        position: 0,
        company_name: companyName,
        kvk: str(body.kvk),
        website: str(body.website),
        sector: str(body.sector),
        contact_name: str(body.contact_name) ?? str(body.name),
        contact_role: str(body.contact_role),
        contact_email: str(body.contact_email) ?? str(body.email),
        contact_phone: str(body.contact_phone) ?? str(body.phone),
        address_street: str(body.address_street),
        postal_code: str(body.postal_code),
        city: str(body.city),
        location_type: str(body.location_type),
        estimated_charge_points: int(body.estimated_charge_points),
        estimated_kwh_per_month: numv(body.estimated_kwh_per_month),
        charger_type: str(body.charger_type),
        parking_spaces: int(body.parking_spaces),
        notes: str(body.message) ?? str(body.notes),
      })
      .select("id")
      .single();
    if (error) throw error;

    return json({ status: "ok", id: lead.id });
  } catch (err) {
    console.error("lead-intake failed:", (err as Error).message);
    return json({ status: "error", message: "Lead opslaan mislukt" }, 500);
  }
});
