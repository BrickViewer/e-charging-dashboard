import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { buildHandoffPayload, validateSiteForHandoff } from "../_shared/installationHandoff.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { EgroupApiError, EgroupClient } from "./egroup-api.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { logoBrightUrl } from "../_shared/email-assets.ts";
import { renderHandoffEmail } from "./handoff-email.ts";

// Overdracht van een installatie-order naar de E-Group portal. Bouwt een
// volledig payload (klant, site-adres, contact + site_contact, offerte-regels),
// POST naar de E-Group intake-endpoint en bewaart de E-Group order-referenties.
// Idempotent: een al verstuurde order wordt niet opnieuw aangemaakt.
// Body: { order_id }

const corsHeaders = CORS_STD;
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
    const auth = await requireAdminOrInternal(req, sb, corsHeaders, { allowInternal: false, allowSales: true });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.order_id === "string" ? body.order_id : "";
    if (!orderId) return json({ status: "error", message: "order_id ontbreekt" }, 400);

    const { data: order } = await sb
      .from("installation_orders")
      .select(
        "*, clients(company_name, kvk, btw_number, contact_name, contact_email, contact_phone, billing_address_street, billing_address_postal, billing_address_city, country, client_number), companies(name, kvk, btw_number, address_street, postal_code, city), leads(company_name, kvk, contact_name, contact_email, contact_phone, contact_role, address_street, postal_code, city, estimated_charge_points, charger_type), quotes(quote_number, line_items, total_hardware_cost, total_installation_cost, with_management, is_private)",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ status: "error", message: "Order niet gevonden" }, 404);

    // Al verstuurd: idempotent teruggeven, niet opnieuw aanmaken.
    if (order.egroup_order_id) {
      return json({
        status: "ok",
        already_sent: true,
        egroup_order_id: order.egroup_order_id,
        egroup_order_number: order.egroup_order_number,
      });
    }

    // Site-adres verplicht (E-Group project NOT NULL). Blokkeer netjes als incompleet.
    const siteCheck = validateSiteForHandoff(order);
    if (!siteCheck.ok) {
      return json({
        status: "validation_error",
        missing: siteCheck.missing,
        message: `Vul eerst het site-adres aan: ${siteCheck.missing.join(", ")}`,
      });
    }

    // Config (env-first, anders Vault). Niet geconfigureerd: veilig afbreken.
    const intakeUrl = await resolveSecret(sb, ["EGROUP_INTAKE_URL"], "egroup_intake_url");
    const sharedSecret = await resolveSecret(sb, ["EGROUP_SHARED_SECRET"], "egroup_shared_secret");
    if (!intakeUrl || !sharedSecret) {
      return json({ status: "not_configured", message: "E-Group koppeling is nog niet geconfigureerd" });
    }
    const client = new EgroupClient({ intakeUrl, sharedSecret });

    // Atomair claimen tegen dubbele verzending: zet handoff_started_at alleen als de
    // order nog niet verstuurd is én er niet net al een verzending bezig is (of die is
    // ouder dan 2 min = vastgelopen, dan mag opnieuw). Gelijktijdige aanroepen die de
    // claim niet winnen, POSTen niet → geen dubbele opdracht in de E-Portal.
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: claimed } = await sb
      .from("installation_orders")
      .update({ handoff_started_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("egroup_order_id", null)
      .or(`handoff_started_at.is.null,handoff_started_at.lt.${staleCutoff}`)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return json({ status: "ok", already_sent: true, message: "Verzending is al bezig of afgerond" });
    }

    const callbackUrl = `${supabaseUrl}/functions/v1/installation-completion-webhook`;
    const payload = buildHandoffPayload({
      order,
      client: order.clients,
      company: order.companies,
      lead: order.leads,
      quote: order.quotes,
      callbackUrl,
    });

    try {
      const result = await client.intakeOrder(payload, orderId);
      await sb
        .from("installation_orders")
        .update({
          egroup_order_id: result.order_id,
          egroup_order_number: result.order_number || null,
          external_ref: result.order_number || null,
          status: "overgedragen",
          handoff_at: new Date().toISOString(),
          last_sync_error: null,
        })
        .eq("id", orderId);

      if (order.client_id) {
        await sb.from("activity_log").insert({
          organization_id: order.organization_id,
          client_id: order.client_id,
          user_id: auth.userId ?? null,
          action: "installation_order_handed_off",
          description: `Installatie-order overgedragen naar E-Group (${result.order_number || result.order_id})`,
          metadata: { order_id: orderId, egroup_order_id: result.order_id, egroup_order_number: result.order_number },
        });
      }

      // Best-effort notificatie naar E-Group: de opdracht staat klaar in de e-portal.
      // Staat ná de idempotente short-circuit (boven), dus alleen een échte nieuwe handoff
      // mailt — geen dubbele. Een mislukte mail mag de handoff nooit laten falen.
      try {
        const { data: org } = await sb
          .from("organizations")
          .select("handoff_notification_email")
          .eq("id", order.organization_id)
          .maybeSingle();
        const recipient = (org?.handoff_notification_email || "").trim() || "willi-jan.jonkers@e-group.nl";
        const clientName = order.clients?.company_name || order.companies?.name || order.leads?.company_name || "Onbekende klant";
        const siteAddress = [
          [order.site_street, order.site_house_number].filter(Boolean).join(" ").trim(),
          [order.site_postal, order.site_city].filter(Boolean).join(" ").trim(),
        ].filter(Boolean).join(", ");
        const serviceLabel = [order.service_category, order.service_summary]
          .filter((v) => v && String(v).trim())
          .map((v) => String(v).trim())
          .join(" — ");
        const { subject, html, text } = renderHandoffEmail({
          orderNumber: result.order_number || null,
          clientName,
          siteAddress,
          contactName: order.site_contact_name ?? null,
          contactPhone: order.site_contact_phone ?? null,
          contactEmail: order.site_contact_email ?? null,
          serviceLabel,
          notes: order.notes ?? null,
          logoUrl: logoBrightUrl,
        });
        const mailRes = await sendEmail({
          to: [recipient],
          subject,
          html,
          text,
          tags: [{ name: "type", value: "order_handoff" }],
        });
        if (!mailRes.ok) {
          console.error("order-handoff notificatiemail Resend-fout", mailRes.status, await mailRes.text().catch(() => ""));
        }
      } catch (mailErr) {
        console.error("order-handoff notificatiemail mislukt", mailErr);
      }

      return json({ status: "ok", egroup_order_id: result.order_id, egroup_order_number: result.order_number });
    } catch (err) {
      const message = err instanceof EgroupApiError ? `E-Group ${err.status}: ${err.message}` : (err as Error).message;
      // Claim vrijgeven zodat opnieuw versturen kan na een fout.
      await sb.from("installation_orders").update({ last_sync_error: message, handoff_started_at: null }).eq("id", orderId);
      if (order.client_id) {
        await sb.from("activity_log").insert({
          organization_id: order.organization_id,
          client_id: order.client_id,
          user_id: auth.userId ?? null,
          action: "installation_order_handoff_failed",
          description: `Overdracht naar E-Group mislukt: ${message}`,
          metadata: { order_id: orderId },
        });
      }
      return json({ status: "error", message }, 502);
    }
  } catch (err) {
    return json({ status: "error", message: err instanceof Error ? err.message : "Overdracht mislukt" }, 500);
  }
});
