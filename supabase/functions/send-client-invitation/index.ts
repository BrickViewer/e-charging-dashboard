import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getEmailHeroV1Bytes, getEmailHeroV2Bytes, getEmailLogoBytes } from "./email-logo.ts";
import { renderInviteEmail } from "./email-template.ts";
import { sha256Hex, generateToken } from "../_shared/hash.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// Send-client-invitation — verstuurt e-charging-branded uitnodiging via Resend.
// Body: { client_id: string, resend?: boolean }
//   - client_id: voor welke klant de uitnodiging is
//   - resend: true → oude pending invite intrekken en verse single-use token mailen

const corsHeaders = CORS_STD;

function imageHeaders(filename: string) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET" || req.method === "HEAD") {
    const path = new URL(req.url).pathname;
    if (path.endsWith("/logo-v3.png") || path.endsWith("/logo.png")) {
      const logoBytes = getEmailLogoBytes();
      return new Response(req.method === "HEAD" ? null : logoBytes, {
        headers: imageHeaders("e-charging-logo-bright.png"),
      });
    }

    if (path.endsWith("/hero-mobile-v2.png") || path.endsWith("/hero-v2.png")) {
      const heroBytes = getEmailHeroV2Bytes();
      return new Response(req.method === "HEAD" ? null : heroBytes, {
        headers: imageHeaders("e-charging-invite-hero-v2.png"),
      });
    }

    if (path.endsWith("/hero-mobile-v1.png") || path.endsWith("/hero-v1.png")) {
      const heroBytes = getEmailHeroV1Bytes();
      return new Response(req.method === "HEAD" ? null : heroBytes, {
        headers: imageHeaders("e-charging-invite-hero-v1.png"),
      });
    }

    return json({ status: "not_found" }, 404);
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json({ status: "not_configured", message: "RESEND_API_KEY ontbreekt in environment" }, 500);
    }

    const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
    const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://e-charging.nl").replace(/\/+$/, "");

    const body = await req.json().catch(() => ({}));
    const { client_id, resend: isResend } = body;

    if (!client_id) {
      return json({ status: "error", message: "client_id verplicht" }, 400);
    }

    // Auth: only admin/manager mag uitnodigingen versturen
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ status: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: "unauthorized" }, 401);

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r) => r.role);
    // superadmin telt als admin-niveau; meerdere rollen mogelijk dus geen .maybeSingle()
    if (!roles.includes("admin") && !roles.includes("manager") && !roles.includes("sales") && !roles.includes("superadmin")) {
      return json({ status: "forbidden", message: "Alleen admin/manager/sales mag uitnodigen" }, 403);
    }

    // Klant ophalen
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, client_number, company_name, contact_name, contact_email, portal_user_id, person_id")
      .eq("id", client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ status: "error", message: "Klant niet gevonden" }, 404);
    if (client.portal_user_id) {
      return json({ status: "already_linked", message: "Klant heeft al een actief portal-account" }, 409);
    }
    // E-mail bepalen: klant-adres, anders het adres van de gekoppelde persoon (bron-van-waarheid).
    let recipientEmail = (client.contact_email as string | null) || null;
    if (!recipientEmail && client.person_id) {
      const { data: person } = await supabase.from("persons").select("email").eq("id", client.person_id).maybeSingle();
      recipientEmail = (person?.email as string | null) || null;
    }
    if (!recipientEmail) {
      return json({ status: "error", message: "Klant heeft geen e-mailadres" }, 400);
    }

    const { data: latestPending } = await supabase
      .from("client_invitations")
      .select("id, resend_count")
      .eq("client_id", client_id)
      .eq("status", "pending")
      .order("invited_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Oude pending invites worden ongeldig bij elke nieuwe verzending. Daardoor hoeft
    // de raw token nooit in de database bewaard te blijven voor "resend".
    await supabase
      .from("client_invitations")
      .update({ status: "revoked" })
      .eq("client_id", client_id)
      .eq("status", "pending");

    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: createErr } = await supabase
      .from("client_invitations")
      .insert({
        client_id,
        email: recipientEmail,
        token_hash: tokenHash,
        token_last4: token.slice(-4),
        status: "pending",
        invited_by: user.id,
        resend_count: isResend ? Number(latestPending?.resend_count ?? 0) + 1 : 0,
        last_resend_at: isResend ? new Date().toISOString() : null,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (createErr) throw createErr;

    const inviteUrl = `${PUBLIC_URL}/uitnodiging/${token}`;
    const expiresInDays = Math.ceil(
      (new Date(invitation.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const { subject, html, text } = renderInviteEmail({
      companyName: client.company_name,
      contactName: client.contact_name ?? "klant",
      inviteUrl,
      expiresInDays: Math.max(expiresInDays, 1),
      fromName: FROM_NAME,
      heroUrl: `${supabaseUrl}/functions/v1/send-client-invitation/hero-mobile-v2.png`,
      clientNumber: client.client_number,
    });

    // Send via Resend API
    const resendRes = await sendEmail({
      to: [recipientEmail],
      subject,
      html,
      text,
      tags: [
        { name: "type", value: "client_invitation" },
        { name: "client_id", value: client_id },
      ],
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend API failed:", resendRes.status, errText);

      // Markeer invite niet als verstuurd, gooi error
      return json({
        status: "send_failed",
        statusCode: resendRes.status,
        message: `Resend gaf ${resendRes.status}: ${errText}`,
      }, 502);
    }

    const resendData = await resendRes.json();

    // Activity log
    await supabase.from("activity_log").insert({
      client_id,
      user_id: user.id,
      action: isResend ? "invitation_resent" : "invitation_sent",
      description: `Uitnodiging ${isResend ? "opnieuw " : ""}verstuurd naar ${recipientEmail}`,
      metadata: {
        invitation_id: invitation.id,
        resend_id: resendData.id,
        email: recipientEmail,
        client_number: client.client_number,
      },
    });

    return json({
      status: "sent",
      invitation_id: invitation.id,
      resend_id: resendData.id,
      expires_at: invitation.expires_at,
      to: recipientEmail,
    });
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("send-client-invitation failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
