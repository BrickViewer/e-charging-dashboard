import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderClientMessageEmail } from "./message-email.ts";
import { logoBrightUrl } from "../_shared/email-assets.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { requireAdminOrInternal } from "../_shared/auth.ts";

// send-client-message — staf stuurt een klant een bericht dat (a) in het klantportaal onder
// "Berichten" verschijnt (rij in notifications) én (b) als E-Charging-branded e-mail binnenkomt.
// Body: { client_id: string, subject: string, message: string }
//
// Alleen admin/manager (verify_jwt = true; geen interne/service-caller toegestaan). Het
// portaalbericht wordt alleen geplaatst als de klant een actief portal_user_id heeft; de e-mail
// gaat altijd zolang er een adres is (contact_email, anders het adres van de gekoppelde persoon).
// Beide kanalen worden los geprobeerd; het resultaat komt terug in de response zodat de UI de
// juiste toast kan tonen. Spiegelt send-client-invitation.

const corsHeaders = CORS_STD;
const PORTAL_MESSAGES_URL = "https://dashboard.e-charging.nl/portal/berichten";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json({ status: "not_configured", message: "RESEND_API_KEY ontbreekt in environment" }, 500);
    }

    // Alleen admin/manager mag een klant een bericht sturen — geen interne secret-caller.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auth = await requireAdminOrInternal(req, supabase as any, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;
    const senderUserId = auth.userId ?? null;

    const body = await req.json().catch(() => ({}));
    const client_id = typeof body.client_id === "string" ? body.client_id : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!client_id) return json({ status: "error", message: "client_id verplicht" }, 400);
    if (!subject) return json({ status: "error", message: "Onderwerp verplicht" }, 400);
    if (!message) return json({ status: "error", message: "Bericht verplicht" }, 400);

    const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";

    // Klant laden + doel-e-mail bepalen (zelfde fallback als send-client-invitation:
    // klant-adres, anders het adres van de gekoppelde persoon = bron van waarheid).
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, client_number, company_name, contact_name, contact_email, portal_user_id, person_id")
      .eq("id", client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ status: "error", message: "Klant niet gevonden" }, 404);

    let recipientEmail = (client.contact_email as string | null) || null;
    if (!recipientEmail && client.person_id) {
      const { data: person } = await supabase.from("persons").select("email").eq("id", client.person_id).maybeSingle();
      recipientEmail = (person?.email as string | null) || null;
    }

    const hasPortal = !!client.portal_user_id;
    if (!hasPortal && !recipientEmail) {
      return json({ status: "error", message: "Klant heeft geen e-mailadres én geen portaalaccount" }, 400);
    }

    // 1) Portaalbericht — alleen als de klant een portal-account heeft (recipient_id = auth-user).
    let portalDelivered = false;
    if (hasPortal) {
      const { error: notifErr } = await supabase.from("notifications").insert({
        recipient_id: client.portal_user_id,
        type: "admin_message",
        title: subject,
        message,
      });
      if (notifErr) throw notifErr; // portaal-insert hoort altijd te lukken → hard falen
      portalDelivered = true;
    }

    // 2) E-mail — altijd als er een adres is (best-effort; een mislukking faalt de actie niet
    //    hard zolang het portaalbericht wel is geplaatst).
    let emailDelivered = false;
    let emailError: string | null = null;
    if (recipientEmail) {
      const { subject: mailSubject, html, text } = renderClientMessageEmail({
        companyName: client.company_name ?? "",
        contactName: (client.contact_name as string | null) ?? null,
        subject,
        message,
        portalUrl: hasPortal ? PORTAL_MESSAGES_URL : null,
        logoUrl: logoBrightUrl,
        fromName: FROM_NAME,
      });
      const res = await sendEmail({
        to: [recipientEmail],
        subject: mailSubject,
        html,
        text,
        sender: "info", // klantgerichte communicatie → info@e-charging.nl (reply-to info@)
        tags: [
          { name: "type", value: "client_message" },
          { name: "client_id", value: client_id },
        ],
      });
      if (res.ok) {
        emailDelivered = true;
      } else {
        emailError = `Resend gaf ${res.status}: ${await res.text()}`;
        console.error("send-client-message email failed:", emailError);
      }
    }

    // Beide kanalen mislukt → harde fout (er is niets afgeleverd).
    if (!portalDelivered && !emailDelivered) {
      return json({ status: "send_failed", message: emailError ?? "Versturen mislukt" }, 502);
    }

    // Audittrail in de Activiteit-tab van de klant.
    const channels = [
      portalDelivered ? "portaal" : null,
      emailDelivered ? `e-mail (${recipientEmail})` : null,
    ].filter(Boolean).join(" + ");
    await supabase.from("activity_log").insert({
      client_id,
      user_id: senderUserId,
      action: "portal_message_sent",
      description: `Bericht "${subject}" verstuurd via ${channels}`,
      metadata: {
        subject,
        email: recipientEmail,
        portal_delivered: portalDelivered,
        email_delivered: emailDelivered,
      },
    });

    return json({
      status: "sent",
      to: recipientEmail,
      portal_delivered: portalDelivered,
      email_delivered: emailDelivered,
      email_error: emailError,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("send-client-message failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
