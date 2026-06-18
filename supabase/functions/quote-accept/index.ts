import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderSignedConfirmation, renderInternalSignedNotice } from "../_shared/offer-email.ts";
import { normalizeSettings } from "../_shared/configurator.ts";
import { GraphClient, sanitizeName } from "./sharepoint.ts";
import { resolveSecret } from "../_shared/secrets.ts";

// Publieke offerte-accept (verify_jwt=false). GET valideert de token + geeft de
// offerte-samenvatting (genoeg om de PDF te renderen). POST accordeert: slaat de
// getekende PDF op, zet status 'getekend' + ondertekenaar, maakt/koppelt het
// klantaccount (1:1) + installatie-order, zet de lead op Gewonnen, mailt de klant
// een bevestiging (met PDF) en e-charging een melding.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function bytesToHex(b: Uint8Array) { return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
async function sha256Hex(v: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))); }
function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const RESEND_API = "https://api.resend.com/emails";
async function sendEmail(opts: { to: string; subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
  const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
  try {
    await fetch(RESEND_API, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [opts.to], subject: opts.subject,
        html: opts.html, text: opts.text, reply_to: "info@e-charging.nl",
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      }),
    });
  } catch (_e) { /* mail mag de acceptatie niet blokkeren */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ status: "error", message: "Serverconfiguratie ontbreekt" }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
    token = typeof body.token === "string" && body.token ? body.token : token;
  }
  if (!token) return json({ status: "error", message: "Token ontbreekt" }, 400);

  try {
    const tokenHash = await sha256Hex(token);
    const { data: acc } = await sb.from("quote_acceptances").select("*").eq("token_hash", tokenHash).maybeSingle();
    if (!acc) return json({ status: "not_found", message: "Offerte-link niet gevonden" }, 404);
    const expired = new Date(acc.expires_at).getTime() < Date.now();

    const { data: quote } = await sb.from("quotes").select("*").eq("id", acc.quote_id).maybeSingle();
    if (!quote) return json({ status: "not_found", message: "Offerte niet gevonden" }, 404);

    const { data: lead } = quote.lead_id
      ? await sb.from("leads").select("*").eq("id", quote.lead_id).maybeSingle()
      : { data: null as any };

    const total = (Number(quote.total_hardware_cost) || 0) + (Number(quote.total_installation_cost) || 0);
    const tariffs = (quote.tariff_data ?? {}) as Record<string, any>;
    const snap = (quote.calculation_snapshot ?? {}) as Record<string, any>;
    const addr = lead ? [lead.address_street, [lead.postal_code, lead.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

    // Offerte-sjabloon-standaarden ophalen (voor de placeholders die niet in de offerte zelf staan).
    const { data: settingsRow } = await sb.from("configurator_settings")
      .select("settings").eq("organization_id", quote.organization_id).eq("is_active", true)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const offerTemplate = normalizeSettings(settingsRow?.settings).offerTemplate;

    // Samenvatting met alle velden die de publieke pagina nodig heeft om de PDF te renderen.
    const summary = {
      quoteNumber: quote.quote_number,
      company: quote.prospect_company,
      contact: quote.prospect_contact,
      addressLine: addr || null,
      numChargePoints: quote.num_charge_points ?? null,
      total,
      withManagement: quote.with_management !== false,
      durationMonths: snap?.pricing_input?.contract?.durationMonths ?? null,
      noticeMonths: snap?.pricing_input?.contract?.noticePeriodMonths ?? null,
      chargeTariffPerKwh: num(quote.charge_rate_per_kwh) ?? num(tariffs.chargeTariffPerKwh),
      idleFeePerMinute: num(tariffs.idleFeePerMinute),
      startFeePerSession: num(tariffs.startFeePerSession),
      idleGraceMinutes: num(tariffs.idleGraceMinutes),
      validUntil: quote.valid_until,
      date: quote.sent_at ?? quote.created_at ?? null,
      status: quote.status,
      acceptanceStatus: acc.status,
      offerDetails: (quote.offer_details ?? {}) as Record<string, unknown>,
      offerTemplate,
      // E-Charging mede-ondertekening — zodat de klant de al getekende offerte ziet.
      internalSignatureDataUrl: quote.internal_signature_data_url ?? null,
      internalSignerName: quote.internal_signer_name ?? null,
      internalSignerFunction: quote.internal_signer_function ?? null,
    };

    if (req.method === "GET") {
      if (acc.status === "accepted" || quote.status === "getekend") return json({ status: "already_accepted", quote: summary });
      if (acc.status === "revoked") return json({ status: "revoked", message: "Deze offerte-link is vervangen door een nieuwere." }, 410);
      if (expired) return json({ status: "expired", message: "Deze offerte-link is verlopen." }, 410);
      return json({ status: "ok", quote: summary });
    }

    // POST = accorderen
    if (acc.status === "accepted" || quote.status === "getekend") return json({ status: "already_accepted", quote: summary });
    if (acc.status !== "pending" || expired) return json({ status: "invalid", message: "Deze link is niet meer geldig." }, 410);

    const signerName = typeof body.signer_name === "string" ? body.signer_name.trim() : "";
    if (!signerName) return json({ status: "invalid", message: "Naam ontbreekt." }, 400);
    const signedPdfB64 = typeof body.signed_pdf_base64 === "string" ? body.signed_pdf_base64 : "";

    const org = quote.organization_id as string;
    const companyId = (lead?.company_id ?? quote.company_id) as string | null;
    const personId = (lead?.person_id ?? quote.person_id) as string | null;

    // Bron-van-waarheid completeren: zet e-mail/telefoon op de persoon als die leeg is.
    if (personId) {
      const email = (lead?.contact_email ?? quote.prospect_email ?? null) as string | null;
      const phone = (lead?.contact_phone ?? null) as string | null;
      if (email || phone) {
        const { data: per } = await sb.from("persons").select("email, phone").eq("id", personId).maybeSingle();
        const pPatch: Record<string, unknown> = {};
        if (email && !per?.email) pPatch.email = email;
        if (phone && !per?.phone) pPatch.phone = phone;
        if (Object.keys(pPatch).length) await sb.from("persons").update(pPatch).eq("id", personId);
      }
    }

    // Klantaccount aanmaken of koppelen (1 bedrijf = 1 account).
    let clientId = quote.client_id as string | null;
    if (!clientId && companyId) {
      const { data: existing } = await sb
        .from("clients").select("id, status").eq("organization_id", org).eq("company_id", companyId)
        .neq("status", "verwijderd").order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (existing) {
        clientId = existing.id;
        if (existing.status === "inactief") await sb.from("clients").update({ status: "actief" }).eq("id", existing.id);
      }
    }
    if (!clientId) {
      const { data: created, error: cErr } = await sb.from("clients").insert({
        organization_id: org,
        company_id: companyId,
        person_id: personId,
        company_name: lead?.company_name ?? quote.prospect_company ?? "Onbekend bedrijf",
        contact_name: lead?.contact_name ?? quote.prospect_contact ?? null,
        contact_email: lead?.contact_email ?? quote.prospect_email ?? null,
        contact_phone: lead?.contact_phone ?? null,
        billing_address_street: lead?.address_street ?? null,
        billing_address_postal: lead?.postal_code ?? null,
        billing_address_city: lead?.city ?? null,
        charge_rate_per_kwh: num(quote.charge_rate_per_kwh) ?? undefined,
        energy_cost_per_kwh: num(quote.energy_cost_per_kwh) ?? undefined,
        // 'Zonder beheer' → klant zonder dashboard/opbrengstdeling (later upgradebaar).
        managed: quote.with_management === false ? false : true,
        status: "actief",
        notes: `Aangemaakt via offerte ${quote.quote_number}`,
      }).select("id").single();
      if (cErr) throw cErr;
      clientId = created.id;
    }

    // Idempotentie: configuratie + installatie-order alleen bij de eerste afronding.
    const isFirstFinalize = !quote.client_id;
    // Koppel het account vroeg, zodat een retry na een SharePoint-blip niets dubbel doet.
    await sb.from("quotes").update({ client_id: clientId }).eq("id", quote.id);

    if (isFirstFinalize) {
      // Configuratie-snapshot op het account (nieuwe versie).
      const cfg = (quote.calculation_snapshot ?? null) as Record<string, any> | null;
      if (cfg?.pricing_input && cfg?.pricing_result) {
        const { data: maxV } = await sb.from("customer_configurations").select("version").eq("client_id", clientId)
          .order("version", { ascending: false }).limit(1).maybeSingle();
        await sb.from("customer_configurations").insert({
          client_id: clientId, organization_id: org, version: (maxV?.version ?? 0) + 1,
          settings_version: num(cfg.settings_version) ?? 1, pricing_input: cfg.pricing_input,
          pricing_result: cfg.pricing_result, status: "agreed",
        });
      }
      // Installatie-order (exact één per offerte).
      const { data: existingOrder } = await sb.from("installation_orders").select("id").eq("quote_id", quote.id).maybeSingle();
      if (!existingOrder) {
        await sb.from("installation_orders").insert({
          organization_id: org, client_id: clientId, quote_id: quote.id, lead_id: quote.lead_id ?? null,
          company_id: companyId, status: "nieuw",
          notes: `Vanuit getekende offerte ${quote.quote_number}`,
        });
      }
    }

    // Getekende PDF ALTIJD in Supabase opslaan (zo hebben we 'm zeker + kunnen we mailen);
    // van daaruit gaat 'ie naar SharePoint. Een storage-fout mag de klant niet blokkeren.
    let signedPath: string | null = (quote.signed_pdf_path as string | null) ?? null;
    if (signedPdfB64 && !signedPath) {
      const path = `signed/${quote.id}.pdf`;
      const { error: upErr } = await sb.storage.from("quote-documents")
        .upload(path, base64ToBytes(signedPdfB64), { contentType: "application/pdf", upsert: true });
      if (!upErr) signedPath = path;
      else console.error("[quote-accept] getekende PDF opslaan mislukt:", upErr.message);
    }

    // SharePoint: getekend exemplaar (OPD) in de Opdracht-submap. BEST-EFFORT — nooit blokkerend.
    // Mislukt het, dan haalt de cron 'quote-opd-sync' het later op uit Supabase.
    let opdWebUrl: string | null = (quote.opd_web_url as string | null) ?? null;
    try {
      const spTenant = await resolveSecret(sb, ["SHAREPOINT_TENANT_ID"], "sharepoint_tenant_id");
      const spClient = await resolveSecret(sb, ["SHAREPOINT_CLIENT_ID"], "sharepoint_client_id");
      const spSecret = await resolveSecret(sb, ["SHAREPOINT_CLIENT_SECRET"], "sharepoint_client_secret");
      const gc = (spTenant && spClient && spSecret) ? new GraphClient(spTenant, spClient, spSecret) : null;
      const { data: org2 } = await sb.from("organizations").select("sharepoint_drive_id").eq("id", org).maybeSingle();
      const driveId = org2?.sharepoint_drive_id as string | null;
      if (gc && driveId && quote.project_location_id && signedPdfB64 && !quote.opd_item_id) {
        const { data: loc } = await sb.from("project_locations")
          .select("opdracht_item_id, location_number, address_street, city").eq("id", quote.project_location_id).maybeSingle();
        if (loc?.opdracht_item_id) {
          const yy = String(new Date(quote.sent_at ?? new Date().toISOString()).getFullYear()).slice(-2);
          const doc2 = String(quote.document_number ?? 1).padStart(2, "0");
          const addrLabel = [loc.address_street, loc.city].filter(Boolean).join(" ") || String(quote.prospect_company ?? "");
          const opdName = sanitizeName(`${loc.location_number}-${doc2}-${yy} OPD ${addrLabel}`) + ".pdf";
          const opd = await gc.uploadFile(driveId, loc.opdracht_item_id, opdName, base64ToBytes(signedPdfB64));
          opdWebUrl = opd.webUrl;
          await sb.from("quotes").update({ opd_item_id: opd.id, opd_web_url: opd.webUrl }).eq("id", quote.id);
        }
      }
    } catch (e) {
      console.error("[quote-accept] OPD naar SharePoint mislukt (cron probeert later opnieuw):", e instanceof Error ? e.message : e);
    }

    // Dossier aan het klantaccount koppelen (alleen bij beheer).
    if (quote.project_location_id && quote.with_management !== false) {
      await sb.from("project_locations").update({ client_id: clientId }).eq("id", quote.project_location_id);
    }

    // Offerte + acceptatie afronden — ALTIJD (ook als SharePoint nog faalde; OPD volgt via de cron).
    await sb.from("quotes").update({
      status: "getekend", signed_at: new Date().toISOString(), client_id: clientId, signer_name: signerName, signed_pdf_path: signedPath,
    }).eq("id", quote.id);
    await sb.from("quote_acceptances").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", acc.id);

    // Lead naar Gewonnen + koppelen.
    if (lead) {
      const { data: wonStage } = await sb.from("lead_stages").select("id")
        .eq("organization_id", org).eq("is_won", true).order("position", { ascending: true }).limit(1).maybeSingle();
      // Respecteer een eerdere (handmatige) conversie: overschrijf de koppeling niet.
      const patch: Record<string, unknown> = { converted_client_id: lead.converted_client_id ?? clientId, quote_id: quote.id };
      if (wonStage?.id) patch.stage_id = wonStage.id;
      await sb.from("leads").update(patch).eq("id", lead.id);
      await sb.from("lead_activities").insert({
        lead_id: lead.id, organization_id: org, type: "quote_accepted",
        description: `Offerte ${quote.quote_number} getekend door ${signerName} → klantaccount + installatie-order`,
        metadata: { quote_id: quote.id, client_id: clientId, signer_name: signerName },
      });
    }
    await sb.from("activity_log").insert({
      organization_id: org, client_id: clientId, action: "quote_signed",
      details: { quote_id: quote.id, quote_number: quote.quote_number, signer_name: signerName, opd_web_url: opdWebUrl },
    });

    // Mails: klant-bevestiging (met getekende PDF) + interne melding.
    const attach = signedPdfB64 ? [{ filename: `offerte-${quote.quote_number}.pdf`, content: signedPdfB64.replace(/^data:[^,]+,/, "") }] : undefined;
    const hasAttachment = !!attach;
    const recipient = (quote.prospect_email ?? lead?.contact_email) as string | null;
    if (recipient) {
      const m = renderSignedConfirmation({ supabaseUrl, quoteNumber: quote.quote_number, signerName, total, hasAttachment });
      await sendEmail({ to: recipient, subject: `E-Charging · Offerte ${quote.quote_number} ondertekend`, html: m.html, text: m.text, attachments: attach });
    }
    {
      const m = renderInternalSignedNotice({ supabaseUrl, quoteNumber: quote.quote_number, company: quote.prospect_company, signerName, total });
      await sendEmail({ to: "info@e-charging.nl", subject: `Offerte ${quote.quote_number} ondertekend${quote.prospect_company ? ` — ${quote.prospect_company}` : ""}`, html: m.html, text: m.text, attachments: attach });
    }

    return json({ status: "accepted", quote: { ...summary, status: "getekend", acceptanceStatus: "accepted" } });
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Verwerken mislukt" }, 500);
  }
});
