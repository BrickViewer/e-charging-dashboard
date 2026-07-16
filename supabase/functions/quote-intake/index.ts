import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { linkPersonToCompany, resolveOrCreateCompany, resolveOrCreatePerson } from "../_shared/contacts.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { buildCors } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { renderIntakeConfirmation, renderInternalIntakeNotice } from "./email.ts";
import {
  BESTAAND_NIEUWBOUW,
  EIGENDOM,
  TRIAGE_LABEL,
  TRIAGE_TAAK,
  TYPE_LOCATIE,
  label,
  maandLabel,
  type Flow,
} from "./labels.ts";
import {
  BadRequest,
  buildSummary,
  collectFiles,
  combineHuisnummer,
  computeTriage,
  locatieAdresRegel,
  parseParticulier,
  parseZakelijk,
  type ParticulierData,
  type ZakelijkData,
} from "./validate.ts";

// Publiek endpoint van de offerte-wizard (www.e-charging.nl/offerte). verify_jwt = false.
// Twee acties:
//   action="upload_url" → signed upload URL zodat de browser een foto/video rechtstreeks
//                          naar de privé-bucket intake-uploads schrijft (150 MB kan niet
//                          door een edge function heen).
//   action="submit"     → de aanvraag zelf: lead + quote_requests + taak + twee mails.
// Beveiliging, gelaagd zoals contact-intake:
//   1. CORS beperkt tot de eigen domeinen.
//   2. Honeypot-veld (hp / website_url_hp).
//   3. Rate-limiting per gehasht IP via quote_intake_log.
//   4. Optioneel Cloudflare Turnstile zodra TURNSTILE_SECRET_KEY is gezet.
//   5. Servervalidatie van álles; bestandspaden moeten door ons zijn uitgegeven én bestaan.

const BUCKET = "intake-uploads";
const ALLOWED_ORIGINS = ["https://www.e-charging.nl", "https://e-charging.nl"];

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const PHOTO_MAX = 15 * 1024 * 1024;
const VIDEO_MAX = 150 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
/** Video mag alleen waar het formulier erom vraagt: de route en de situatieschets. */
const KINDS_MET_VIDEO = ["route", "situatie"];
const KINDS = ["meterkast", "plek", "route", "situatie"];

const UPLOAD_URL_PER_10MIN = 40;
const SUBMIT_PER_60MIN = 5;

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
}
function corsHeaders(origin: string) {
  return buildCors({
    origin: isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    headers: "content-type",
    methods: "POST, OPTIONS",
    vary: true,
  });
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Vertrouwd client-IP. NIET x-forwarded-for[0]: dat is de door de client zelf ingestuurde
// (spoofbare) eerste hop. cf-connecting-ip zet Cloudflare; x-real-ip is de gateway-waarde.
function clientIp(req: Request): string {
  const cf = str(req.headers.get("cf-connecting-ip"));
  if (cf) return cf;
  const real = str(req.headers.get("x-real-ip"));
  if (real) return real;
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : "";
}

type Sb = ReturnType<typeof createClient>;

async function rateLimited(sb: Sb, ipHash: string | null, kind: "upload_url" | "submit", max: number, minutes: number) {
  if (!ipHash) return false;
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { count } = await sb
    .from("quote_intake_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("kind", kind)
    .gte("created_at", since);
  return (count ?? 0) >= max;
}

async function verifyTurnstile(req: Request, token: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true; // niet geconfigureerd → overslaan (zoals contact-intake)
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = clientIp(req);
  if (ip) form.append("remoteip", ip);
  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
    .then((r) => r.json())
    .catch(() => ({ success: false }));
  return verify.success === true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500, origin);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));

    // 2. Honeypot — gevuld = bot → doe alsof het lukt, sla niets op.
    if (str(body.hp) || str(body.website_url_hp)) return json({ status: "ok" }, 200, origin);

    const flow = str(body.flow);
    if (flow !== "particulier" && flow !== "zakelijk") {
      return json({ status: "error", message: "Onbekend formuliertype" }, 400, origin);
    }

    const ipRaw = clientIp(req);
    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null;

    if (str(body.action) === "upload_url") {
      return await handleUploadUrl(sb, body, flow, ipHash, origin);
    }
    if (str(body.action) === "submit") {
      if (!(await verifyTurnstile(req, str(body.turnstile_token)))) {
        return json({ status: "error", message: "Verificatie mislukt" }, 400, origin);
      }
      return await handleSubmit(sb, body, flow, ipHash, origin);
    }
    return json({ status: "error", message: "Onbekende actie" }, 400, origin);
  } catch (err) {
    if (err instanceof BadRequest) return json({ status: "error", message: err.message }, 400, origin);
    console.error("quote-intake failed:", err instanceof Error ? err.message : err);
    return json({ status: "error", message: "Versturen mislukt" }, 500, origin);
  }
});

/* ───────────────────────────── actie: upload_url ───────────────────────────── */

async function handleUploadUrl(
  sb: Sb,
  body: Record<string, unknown>,
  flow: Flow,
  ipHash: string | null,
  origin: string,
) {
  const kind = str(body.kind);
  if (!KINDS.includes(kind)) return json({ status: "error", message: "Onbekend bestandstype" }, 400, origin);

  const contentType = str(body.content_type);
  const isVideo = VIDEO_TYPES.includes(contentType);
  const isPhoto = PHOTO_TYPES.includes(contentType);
  if (!isPhoto && !isVideo) return json({ status: "error", message: "Dit bestandstype wordt niet ondersteund" }, 400, origin);
  if (isVideo && !KINDS_MET_VIDEO.includes(kind)) {
    return json({ status: "error", message: "Hier kunt u alleen een foto toevoegen" }, 400, origin);
  }

  const size = typeof body.size === "number" ? body.size : -1;
  if (size < 0 || size > (isVideo ? VIDEO_MAX : PHOTO_MAX)) {
    return json({ status: "error", message: "Dit bestand is te groot" }, 400, origin);
  }

  if (await rateLimited(sb, ipHash, "upload_url", UPLOAD_URL_PER_10MIN, 10)) {
    return json({ status: "rate_limited", message: "Te veel uploads — probeer het later opnieuw." }, 429, origin);
  }

  // Het pad komt volledig van de server: de bestandsnaam van de bezoeker raakt
  // het pad nooit aan (geen traversal, geen collisions, geen persoonsgegevens in de naam).
  const path = `qi/${crypto.randomUUID()}/${crypto.randomUUID()}.${EXT[contentType]}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("createSignedUploadUrl failed:", error?.message, { flow, kind });
    return json({ status: "error", message: "Uploaden kon niet worden voorbereid" }, 500, origin);
  }

  if (ipHash) await sb.from("quote_intake_log").insert({ ip_hash: ipHash, kind: "upload_url" });

  // data.signedUrl is absoluut (https://<project>.supabase.co/storage/v1/object/upload/sign/…)
  return json({ status: "ok", path: data.path ?? path, upload_url: data.signedUrl }, 200, origin);
}

/* ────────────────────────────── actie: submit ────────────────────────────── */

async function handleSubmit(sb: Sb, body: Record<string, unknown>, flow: Flow, ipHash: string | null, origin: string) {
  if (await rateLimited(sb, ipHash, "submit", SUBMIT_PER_60MIN, 60)) {
    return json({ status: "rate_limited", message: "Te veel aanvragen — probeer het later opnieuw." }, 429, origin);
  }

  const data = flow === "particulier" ? parseParticulier(body.data) : parseZakelijk(body.data);
  const triage = computeTriage(flow, data);
  const files = collectFiles(flow, data);

  // Elk pad moet ook echt bestaan in de bucket. Zo kan niemand een aanvraag insturen
  // met verzonnen paden of paden van een andere inzending.
  for (const f of files) {
    const { error } = await sb.storage.from(BUCKET).createSignedUrl(f.path, 60);
    if (error) throw new BadRequest("Een van de toegevoegde bestanden is niet gevonden");
  }

  const { data: org } = await sb
    .from("organizations")
    .select("id, lead_notification_email")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const orgId = (org?.id as string) ?? "00000000-0000-0000-0000-000000000001";

  const { data: stage } = await sb
    .from("lead_stages")
    .select("id")
    .eq("organization_id", orgId)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const summary = buildSummary(flow, data, triage);
  const leadVelden = flow === "particulier"
    ? particulierLead(data as ParticulierData)
    : zakelijkLead(data as ZakelijkData);

  // CREATE-ONLY: een ongeauthenticeerde inzending mag nooit bestaande contactgegevens
  // overschrijven en nooit de primaire contactpersoon van een bestaand bedrijf kapen.
  const companyId = leadVelden.company_naam_echt
    ? await resolveOrCreateCompany(sb, orgId, { name: leadVelden.company_naam_echt, kvk: leadVelden.kvk ?? null }, { updateExisting: false })
    : null;
  const personId = await resolveOrCreatePerson(
    sb,
    orgId,
    {
      name: leadVelden.contact_name,
      email: leadVelden.contact_email,
      phone: leadVelden.contact_phone,
      role: leadVelden.contact_role ?? null,
    },
    { updateExisting: false },
  );
  if (companyId && personId) await linkPersonToCompany(sb, companyId, personId, false, { ignoreOnConflict: true });

  const { data: lead, error: leadError } = await sb
    .from("leads")
    .insert({
      organization_id: orgId,
      stage_id: stage?.id ?? null,
      company_id: companyId,
      person_id: personId,
      source: `offerteformulier-${flow}`,
      position: 0,
      message_subject: leadVelden.message_subject,
      message_body: summary,
      ...leadVelden.kolommen,
      // Attributie: waar kwam de bezoeker vandaan (blog → lead → koper).
      landing_page: str(body.landing_page) || null,
      referrer: str(body.referrer) || null,
      utm_source: str(body.utm_source) || null,
      utm_medium: str(body.utm_medium) || null,
      utm_campaign: str(body.utm_campaign) || null,
      utm_term: str(body.utm_term) || null,
      utm_content: str(body.utm_content) || null,
      first_touch_path: str(body.first_touch_path) || null,
      first_touch_at: str(body.first_touch_at) || null,
      attribution: body.attribution ?? null,
    })
    .select("id")
    .single();
  if (leadError) throw leadError;
  const leadId = lead.id as string;

  const { error: qrError } = await sb.from("quote_requests").insert({
    organization_id: orgId,
    lead_id: leadId,
    flow,
    triage,
    payload: data,
    files,
    updates_opt_in: data.afronden.updates_opt_in,
    ip_hash: ipHash,
  });
  if (qrError) throw qrError;

  // Vervolgactie uit de vragenlijst als taak. Zonder assigned_to, dus dit stuurt geen taak-mail.
  await sb.from("lead_tasks").insert({
    organization_id: orgId,
    lead_id: leadId,
    title: TRIAGE_TAAK[triage],
    position: 0,
  });

  if (data.afronden.updates_opt_in) await tagLead(sb, orgId, leadId, "Nieuwsbrief");

  if (ipHash) await sb.from("quote_intake_log").insert({ ip_hash: ipHash, kind: "submit" });

  // Mails zijn niet-fataal: een aanvraag mag nooit sneuvelen op een mailprobleem.
  await Promise.allSettled([
    stuurBevestiging(flow, data, leadVelden.contact_email, leadVelden.contact_name),
    stuurInterneMelding({
      flow,
      triage,
      titel: leadVelden.titel,
      summary,
      leadId,
      aantalBestanden: files.length,
      naar: (org?.lead_notification_email as string) || "info@e-charging.nl",
    }),
  ]);

  return json({ status: "ok" }, 200, origin);
}

/* ─────────────────────────── lead-velden per flow ─────────────────────────── */

function particulierLead(d: ParticulierData) {
  const g = d.gegevens;
  return {
    titel: `${g.naam} — ${g.plaats}`,
    // company_name is NOT NULL; bij een particulier zetten we daar de naam neer,
    // net zoals de dashboard-UI een lead zonder company_id als particulier toont.
    company_naam_echt: "" as string,
    kvk: null as string | null,
    contact_name: g.naam,
    contact_email: g.email,
    contact_phone: g.telefoon,
    contact_role: null as string | null,
    message_subject: `Offerteaanvraag particulier (${d.aantal_laadpalen} ${d.aantal_laadpalen === 1 ? "laadpaal" : "laadpalen"})`,
    kolommen: {
      company_name: g.naam,
      contact_name: g.naam,
      contact_email: g.email,
      contact_phone: g.telefoon,
      address_street: g.straat,
      house_number: combineHuisnummer(g.huisnummer, g.toevoeging),
      postal_code: g.postcode,
      city: g.plaats,
      estimated_charge_points: d.aantal_laadpalen,
      // Vrije tekstkolommen: het dashboard toont ze rauw, dus Nederlandse labels.
      location_type: "Woning",
      grid_notes: `Aansluiting: ${d.meterkast.aansluiting === "1_fase" ? "1-fase" : d.meterkast.aansluiting === "3_fase" ? "3-fase" : "onbekend"}`,
    },
  };
}

function zakelijkLead(d: ZakelijkData) {
  const o = d.organisatie;
  const aantal = parseInt(d.schaal.aantal_laadpunten, 10);
  const typeLocatie =
    d.locatie.type_locatie === "anders" ? d.locatie.type_locatie_anders : label(TYPE_LOCATIE, d.locatie.type_locatie);
  const capaciteit = d.techniek.aansluitwaarde_onbekend
    ? "Aansluitwaarde onbekend"
    : d.techniek.aansluitwaarde
      ? `Aansluitwaarde: ${d.techniek.aansluitwaarde}`
      : "";
  const situatie = d.locatie.bestaand_of_nieuwbouw ? label(BESTAAND_NIEUWBOUW, d.locatie.bestaand_of_nieuwbouw) : "";

  return {
    titel: `${o.bedrijfsnaam} — ${aantal} laadpunten`,
    company_naam_echt: o.bedrijfsnaam,
    kvk: o.kvk || null,
    contact_name: o.contactpersoon,
    contact_email: o.email,
    contact_phone: o.telefoon,
    contact_role: o.functie || null,
    message_subject: `Offerteaanvraag zakelijk (${aantal} ${aantal === 1 ? "laadpunt" : "laadpunten"})`,
    kolommen: {
      company_name: o.bedrijfsnaam,
      kvk: o.kvk || null,
      contact_name: o.contactpersoon,
      contact_role: o.functie || null,
      contact_email: o.email,
      contact_phone: o.telefoon,
      // Nieuwe vorm: losse adreskolommen (activeert de object-matching op
      // postcode + huisnummer). Oude vorm: hele adresregel in address_street.
      address_street: d.locatie.straat || d.locatie.adres,
      house_number: combineHuisnummer(d.locatie.huisnummer, d.locatie.toevoeging) || null,
      postal_code: d.locatie.postcode || null,
      city: d.locatie.plaats || null,
      estimated_charge_points: aantal,
      location_type: typeLocatie,
      owns_property: d.locatie.eigendom ? d.locatie.eigendom === "eigenaar" : null,
      grid_notes: [capaciteit, situatie, d.locatie.eigendom ? label(EIGENDOM, d.locatie.eigendom) : ""]
        .filter(Boolean)
        .join(" · ") || null,
    },
  };
}

/* ──────────────────────────────── tags ──────────────────────────────── */

async function tagLead(sb: Sb, orgId: string, leadId: string, naam: string) {
  try {
    const { data: bestaand } = await sb
      .from("lead_tags")
      .select("id")
      .eq("organization_id", orgId)
      .ilike("name", naam)
      .limit(1)
      .maybeSingle();
    let tagId = bestaand?.id as string | undefined;
    if (!tagId) {
      const { data: nieuw } = await sb
        .from("lead_tags")
        .insert({ organization_id: orgId, name: naam, color: "#05A500" })
        .select("id")
        .single();
      tagId = nieuw?.id as string | undefined;
    }
    if (tagId) await sb.from("lead_tag_links").upsert({ lead_id: leadId, tag_id: tagId }, { ignoreDuplicates: true });
  } catch (err) {
    // Een tag is een nice-to-have; de aanvraag mag er nooit op stuklopen.
    console.error("tagLead failed:", err instanceof Error ? err.message : err);
  }
}

/* ──────────────────────────────── mails ──────────────────────────────── */

function bevestigingsRegels(flow: Flow, data: ParticulierData | ZakelijkData): Array<[string, string]> {
  if (flow === "particulier") {
    const d = data as ParticulierData;
    const g = d.gegevens;
    return [
      ["Aantal laadpalen", String(d.aantal_laadpalen)],
      ["Adres", `${g.straat} ${g.huisnummer}, ${g.postcode} ${g.plaats}`],
      [
        "Gewenste plaatsing",
        d.afronden.plaatsing === "specifieke_maand" ? maandLabel(d.afronden.plaatsing_maand) : "Zo snel mogelijk",
      ],
    ];
  }
  const d = data as ZakelijkData;
  return [
    ["Organisatie", d.organisatie.bedrijfsnaam],
    ["Locatie", locatieAdresRegel(d.locatie)],
    ["Aantal laadpunten", d.schaal.aantal_laadpunten],
  ];
}

async function stuurBevestiging(flow: Flow, data: ParticulierData | ZakelijkData, email: string, naam: string) {
  const { html, text } = renderIntakeConfirmation({ flow, naam, samenvatting: bevestigingsRegels(flow, data) });
  const res = await sendEmail({
    to: [email],
    sender: "info",
    subject: flow === "particulier" ? "Uw offerteaanvraag bij E-Charging is ontvangen" : "Uw aanvraag bij E-Charging is ontvangen",
    html,
    text,
    tags: [{ name: "type", value: "quote_intake_confirmation" }],
  });
  if (!res.ok) console.error("bevestigingsmail mislukt:", res.status, await res.text().catch(() => ""));
}

async function stuurInterneMelding(o: {
  flow: Flow;
  triage: keyof typeof TRIAGE_LABEL;
  titel: string;
  summary: string;
  leadId: string;
  aantalBestanden: number;
  naar: string;
}) {
  const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");
  const { html, text } = renderInternalIntakeNotice({
    flow: o.flow,
    triage: o.triage,
    titel: o.titel,
    samenvatting: o.summary,
    leadUrl: `${appUrl}/sales/leads?lead=${o.leadId}`,
    aantalBestanden: o.aantalBestanden,
    vervolgactie: TRIAGE_TAAK[o.triage],
  });
  const res = await sendEmail({
    to: [o.naar],
    subject: `Nieuwe offerteaanvraag: ${o.titel} (${TRIAGE_LABEL[o.triage]})`,
    html,
    text,
    tags: [{ name: "type", value: "quote_intake_internal" }],
  });
  if (!res.ok) console.error("interne melding mislukt:", res.status, await res.text().catch(() => ""));
}
