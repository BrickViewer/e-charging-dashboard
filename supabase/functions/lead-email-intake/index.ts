/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { resolveOrCreateCompany, resolveOrCreatePerson, linkPersonToCompany } from "../_shared/contacts.ts";
import { buildCors } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { getAnthropicKey, anthropicMessage, extractJson, DEFAULT_MODEL } from "../_shared/anthropic.ts";
import { splitDutchAddress } from "../_shared/installationHandoff.ts";

// lead-email-intake: een doorgestuurde aanvraag-mail wordt een lead onder "Nieuw", met door Claude uitgelezen
// velden. Twee ingangen: (1) Resend Inbound-webhook (email.received) met Svix-handtekening -> body via de Resend
// API ophalen; (2) handmatig/test via x-intake-secret met {from, subject, text}. De lead wordt ALTIJD aangemaakt
// uit de ruwe mail (AI is verrijking; bij een fout gaat er niets verloren). verify_jwt = false.

const corsHeaders = buildCors({
  headers: "content-type, x-intake-secret, svix-id, svix-timestamp, svix-signature",
  methods: "POST, OPTIONS",
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const enc = new TextEncoder();
function timingSafeEqual(a: string, b: string) {
  const aB = enc.encode(a), bB = enc.encode(b);
  const len = Math.max(aB.length, bB.length);
  let diff = aB.length ^ bB.length;
  for (let i = 0; i < len; i++) diff |= (aB[i] ?? 0) ^ (bB[i] ?? 0);
  return diff === 0;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const numv = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
const stripHtml = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64FromBytes = (b: Uint8Array) => btoa(String.fromCharCode(...b));

// Svix-handtekening (zoals Resend webhooks): teken `${id}.${ts}.${body}` met HMAC-SHA256(base64-decoded secret).
async function verifySvix(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try { keyBytes = b64ToBytes(raw); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${id}.${ts}.${body}`));
  const expected = b64FromBytes(new Uint8Array(mac));
  // Header kan meerdere "v1,<sig>" bevatten (spatie-gescheiden).
  return sigHeader.split(" ").map((s) => (s.includes(",") ? s.split(",")[1] : s)).some((s) => timingSafeEqual(s, expected));
}

const SYSTEM = `Je bent een sales-assistent van een Nederlands bedrijf in laadinfrastructuur. Je krijgt een AANVRAAG-e-mail die door een medewerker van E-Charging is DOORGESTUURD. Haal de gegevens van de OORSPRONKELIJKE aanvrager eruit (de klant/prospect), NIET die van de E-Charging-medewerker die het doorstuurde. De originele afzender staat meestal in het doorgestuurde/geciteerde deel ("Van:" / "From:" / handtekening).

Lever zoveel mogelijk velden in; wat je niet zeker weet -> null. Schrijf in het Nederlands, geen verzinsels.
- summary: 2 tot 4 zinnen die de sales voorbereiden (wat vraagt men, context, urgentie).

Antwoord UITSLUITEND met geldige JSON, exact dit schema:
{"company_name": string|null, "contact_name": string|null, "contact_email": string|null, "contact_phone": string|null, "contact_role": string|null, "sector": string|null, "website": string|null, "kvk": string|null, "address_street": string|null, "postal_code": string|null, "city": string|null, "location_type": string|null, "estimated_charge_points": number|null, "estimated_kwh_per_month": number|null, "charger_type": string|null, "parking_spaces": number|null, "summary": string|null}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const rawBody = await req.text();

  // --- Ingang bepalen + e-mail (from/subject/text) ophalen ---
  let mail: { from: string | null; subject: string | null; text: string | null };
  try {
    if (req.headers.get("svix-signature")) {
      // Resend Inbound-webhook.
      const secret = await resolveSecret(sb, ["RESEND_INBOUND_SIGNING_SECRET"], "resend_inbound_signing_secret");
      if (!secret) return json({ status: "not_configured", message: "RESEND_INBOUND_SIGNING_SECRET ontbreekt" }, 500);
      if (!(await verifySvix(secret, req.headers, rawBody))) return json({ status: "unauthorized", message: "Ongeldige handtekening" }, 401);
      const evt = JSON.parse(rawBody || "{}");
      if (evt?.type !== "email.received") return json({ status: "ignored" });
      const emailId = str(evt?.data?.email_id);
      if (!emailId) return json({ status: "error", message: "Geen email_id" }, 400);
      const resendKey = await resolveSecret(sb, ["RESEND_API_KEY"], "resend_api_key");
      if (!resendKey) return json({ status: "not_configured", message: "RESEND_API_KEY ontbreekt" }, 500);
      const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${resendKey}` } });
      if (!res.ok) return json({ status: "error", message: `Resend gaf ${res.status}` }, 502);
      const full = await res.json();
      mail = { from: str(full.from), subject: str(full.subject), text: str(full.text) ?? (typeof full.html === "string" ? stripHtml(full.html) : null) };
    } else {
      // Handmatig/test via gedeelde sleutel (website-stijl) of het interne service-secret (server-to-server).
      const intakeSecret = Deno.env.get("LEAD_INTAKE_SECRET") ?? "";
      const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
      const okIntake = !!intakeSecret && timingSafeEqual(req.headers.get("x-intake-secret") ?? "", intakeSecret);
      const okInternal = !!internalSecret && timingSafeEqual(req.headers.get("x-internal-secret") ?? "", internalSecret);
      if (!okIntake && !okInternal) return json({ status: "unauthorized", message: "Ongeldige sleutel" }, 401);
      const body = JSON.parse(rawBody || "{}");
      mail = { from: str(body.from), subject: str(body.subject), text: str(body.text) ?? (typeof body.html === "string" ? stripHtml(body.html) : null) };
    }
  } catch (e) {
    return json({ status: "error", message: `Kon de e-mail niet lezen: ${(e as Error).message}` }, 400);
  }

  if (!mail.text && !mail.subject) return json({ status: "error", message: "Lege e-mail" }, 400);

  try {
    const { data: org } = await sb.from("organizations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!org) return json({ status: "error", message: "Geen organisatie gevonden" }, 500);
    const { data: stage } = await sb.from("lead_stages").select("id").eq("organization_id", org.id)
      .order("is_default", { ascending: false }).order("position", { ascending: true }).limit(1).maybeSingle();

    // AI-verrijking (optioneel; lead wordt sowieso aangemaakt).
    let ai: Record<string, unknown> = {};
    const apiKey = await getAnthropicKey(sb);
    if (apiKey) {
      try {
        const settingsRow = await sb.from("content_engine_settings").select("settings").eq("is_active", true).limit(1).maybeSingle();
        const model = typeof (settingsRow.data?.settings as any)?.generation_model === "string" ? (settingsRow.data!.settings as any).generation_model : DEFAULT_MODEL;
        const user = `Doorgestuurd door (negeren): ${mail.from ?? "onbekend"}\nOnderwerp: ${mail.subject ?? ""}\n\n${mail.text ?? ""}`;
        ai = extractJson(await anthropicMessage({ apiKey, system: SYSTEM, user, model, maxTokens: 2000, thinking: "disabled" }));
      } catch (_) { /* AI optioneel */ }
    }

    const companyName = str(ai.company_name);
    const contactName = str(ai.contact_name);
    const contactEmail = str(ai.contact_email);
    const contactPhone = str(ai.contact_phone);
    const contactRole = str(ai.contact_role);

    const companyId = companyName ? await resolveOrCreateCompany(sb, org.id, {
      name: companyName, kvk: str(ai.kvk), website: str(ai.website), sector: str(ai.sector),
      street: str(ai.address_street), postal: str(ai.postal_code), city: str(ai.city),
    }) : null;
    const personId = await resolveOrCreatePerson(sb, org.id, { name: contactName, email: contactEmail, phone: contactPhone, role: contactRole });
    if (companyId && personId) await linkPersonToCompany(sb, companyId, personId, true);

    const leadAddr = splitDutchAddress(str(ai.address_street));
    const { data: lead, error } = await sb.from("leads").insert({
      organization_id: org.id,
      stage_id: stage?.id ?? null,
      company_id: companyId,
      person_id: personId,
      source: "email",
      position: 0,
      company_name: companyName ?? contactName ?? "Onbekend (per e-mail)",
      kvk: str(ai.kvk),
      website: str(ai.website),
      sector: str(ai.sector),
      contact_name: contactName,
      contact_role: contactRole,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      // Intake levert één adresregel; leads slaat straat en huisnummer los op.
      address_street: leadAddr.street || null,
      house_number: leadAddr.house_number || null,
      postal_code: str(ai.postal_code),
      city: str(ai.city),
      location_type: str(ai.location_type),
      estimated_charge_points: int(ai.estimated_charge_points),
      estimated_kwh_per_month: numv(ai.estimated_kwh_per_month),
      charger_type: str(ai.charger_type),
      parking_spaces: int(ai.parking_spaces),
      message_subject: mail.subject,
      message_body: mail.text,
      notes: str(ai.summary),
    }).select("id").single();
    if (error) throw error;

    return json({ status: "ok", id: lead.id, ai_used: Object.keys(ai).length > 0 });
  } catch (err) {
    console.error("lead-email-intake failed:", (err as Error).message);
    return json({ status: "error", message: "Lead opslaan mislukt" }, 500);
  }
});
