/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// ere-request-notify: mailt het team (info@e-charging.nl) dat een klant in het portaal ERE-certificaten wil.
// Wordt aangeroepen door de DB-trigger op clients (via invoke_edge_function, x-internal-secret). verify_jwt = false.

const cors = CORS_INTERNAL;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb as any, cors, { allowInternal: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({} as any));
    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    if (!clientId) return json({ status: "error", message: "client_id ontbreekt" }, 400);

    const { data: client } = await sb.from("clients")
      .select("id, company_name, client_number, contact_name, contact_email, contact_phone")
      .eq("id", clientId).maybeSingle();
    if (!client) return json({ status: "ignored", message: "Klant niet gevonden" });

    const naam = (client.company_name as string | null)?.trim() || "(zonder naam)";
    const nummer = client.client_number ? `#${client.client_number}` : "onbekend";
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");
    const clientUrl = `${appUrl}/beheer/klanten/${client.id}`;

    const rows = [
      ["Klant", naam],
      ["Klantnummer", nummer],
      client.contact_name ? ["Contactpersoon", client.contact_name as string] : null,
      client.contact_email ? ["E-mail", client.contact_email as string] : null,
      client.contact_phone ? ["Telefoon", client.contact_phone as string] : null,
    ].filter(Boolean) as [string, string][];

    const text = [
      `${naam} wil ERE-certificaten aanmelden (aangevinkt in het klantportaal).`,
      ...rows.map(([k, v]) => `${k}: ${v}`),
      ``,
      `Neem contact op om de ERE's voor deze klant aan te melden.`,
      `Klant openen: ${clientUrl}`,
    ].join("\n");

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">
      <p><strong>${esc(naam)}</strong> wil ERE-certificaten aanmelden (aangevinkt in het klantportaal).</p>
      <table style="border-collapse:collapse;margin:8px 0">
        ${rows.map(([k, v]) => `<tr><td style="color:#6b7280;padding:2px 12px 2px 0">${esc(k)}</td><td style="font-weight:600">${esc(v)}</td></tr>`).join("")}
      </table>
      <p>Neem contact op om de ERE's voor deze klant aan te melden.</p>
      <p><a href="${clientUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none">Klant openen</a></p>
      <p style="color:#6b7280">Automatisch verstuurd door het E-Charging dashboard.</p>
    </div>`;

    const res = await sendEmail({
      to: ["info@e-charging.nl"],
      subject: `ERE aangevraagd: ${naam}`,
      html, text,
      tags: [{ name: "type", value: "ere_requested" }],
    });
    if (!res.ok) return json({ status: "send_failed", message: `Resend gaf ${res.status}` }, 502);

    return json({ status: "sent", client_id: client.id });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
