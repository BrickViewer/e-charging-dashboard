import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { renderInviteEmail } from "./email-template.ts";

// Send-client-invitation — verstuurt e-charging-branded uitnodiging via Resend.
// Body: { client_id: string, resend?: boolean }
//   - client_id: voor welke klant de uitnodiging is
//   - resend: true → bestaande pending invite hergebruiken (zelfde token), counter++

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API = "https://api.resend.com/emails";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
    const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
    const PUBLIC_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://e-charging.nl";

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

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    const role = roleRow?.role;
    if (role !== "admin" && role !== "manager") {
      return json({ status: "forbidden", message: "Alleen admin/manager mag uitnodigen" }, 403);
    }

    // Klant ophalen
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, company_name, contact_name, contact_email, portal_user_id")
      .eq("id", client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ status: "error", message: "Klant niet gevonden" }, 404);
    if (client.portal_user_id) {
      return json({ status: "already_linked", message: "Klant heeft al een actief portal-account" }, 409);
    }
    if (!client.contact_email) {
      return json({ status: "error", message: "Klant heeft geen e-mailadres" }, 400);
    }

    // Bestaande pending invite hergebruiken bij resend, anders nieuwe maken
    let invitation;
    if (isResend) {
      const { data: existing } = await supabase
        .from("client_invitations")
        .select("*")
        .eq("client_id", client_id)
        .eq("status", "pending")
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      invitation = existing;
    }

    if (!invitation) {
      // Nieuwe invite — markeer eventuele oude pending invites als revoked
      await supabase
        .from("client_invitations")
        .update({ status: "revoked" })
        .eq("client_id", client_id)
        .eq("status", "pending");

      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

      const { data: newInvite, error: createErr } = await supabase
        .from("client_invitations")
        .insert({
          client_id,
          email: client.contact_email,
          token,
          status: "pending",
          invited_by: user.id,
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();
      if (createErr) throw createErr;
      invitation = newInvite;
    } else {
      // Resend: counter++, verleng expiry
      const { error: updErr } = await supabase
        .from("client_invitations")
        .update({
          resend_count: (invitation.resend_count ?? 0) + 1,
          last_resend_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", invitation.id);
      if (updErr) throw updErr;
    }

    const inviteUrl = `${PUBLIC_URL}/uitnodiging/${invitation.token}`;
    const expiresInDays = Math.ceil(
      (new Date(invitation.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const { subject, html, text } = renderInviteEmail({
      companyName: client.company_name,
      contactName: client.contact_name ?? "klant",
      inviteUrl,
      expiresInDays: Math.max(expiresInDays, 1),
      fromName: FROM_NAME,
    });

    // Send via Resend API
    const resendRes = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [client.contact_email],
        subject,
        html,
        text,
        reply_to: "info@e-charging.nl",
        tags: [
          { name: "type", value: "client_invitation" },
          { name: "client_id", value: client_id },
        ],
      }),
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
      description: `Uitnodiging ${isResend ? "opnieuw " : ""}verstuurd naar ${client.contact_email}`,
      metadata: {
        invitation_id: invitation.id,
        resend_id: resendData.id,
        email: client.contact_email,
      },
    });

    return json({
      status: "sent",
      invitation_id: invitation.id,
      resend_id: resendData.id,
      expires_at: invitation.expires_at,
      to: client.contact_email,
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
