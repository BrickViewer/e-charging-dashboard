import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS_STD } from "../_shared/cors.ts";

// invite-team-member — nodigt een intern teamlid (admin/manager/viewer) uit voor het
// beheer-portaal. Alleen de superadmin mag uitnodigen + rollen toekennen.
// 'superadmin' kan nooit via een uitnodiging worden toegekend (niet in ALLOWED_ROLES).
//   1. auth.admin.generateLink({type:'invite'}) maakt de auth-user + actie-link
//   2. profiel-naam vastleggen + precies één rol zetten (oude rollen wissen)
//   3. branded uitnodiging mailen via Resend (link → /wachtwoord-herstellen)
// Body: { email: string, name?: string, role: "admin"|"manager"|"viewer" }

const corsHeaders = CORS_STD;

const RESEND_API = "https://api.resend.com/emails";
const ALLOWED_ROLES = ["admin", "manager", "sales", "marketing", "viewer"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderTeamInviteHtml(opts: { name: string; role: string; actionLink: string; logoUrl: string }) {
  const greeting = opts.name ? `Hoi ${opts.name},` : "Hoi,";
  return `<!DOCTYPE html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <img src="${opts.logoUrl}" alt="E-Charging" height="30" style="display:block;margin-bottom:28px;" />
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">Je bent uitgenodigd voor het beheer-portaal</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 8px;">${greeting}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 20px;">Je hebt toegang gekregen tot het E-Charging beheer-portaal met de rol <strong style="color:#ffffff;text-transform:capitalize;">${opts.role}</strong>. Activeer je account en stel een wachtwoord in:</p>
    <a href="${opts.actionLink}" style="display:inline-block;background:#05A500;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">Account activeren</a>
    <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:24px 0 0;">Werkt de knop niet? Kopieer deze link in je browser:<br/><span style="color:#6b7280;word-break:break-all;">${opts.actionLink}</span></p>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:24px 0 0;">Heb je deze uitnodiging niet verwacht? Negeer deze e-mail dan.</p>
  </div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    // Auth: alleen de ingelogde superadmin mag uitnodigen + rollen toekennen.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ status: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ status: "unauthorized" }, 401);
    const { data: callerRole } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "superadmin").maybeSingle();
    if (!callerRole) return json({ status: "forbidden", message: "Alleen de superadmin mag teamleden uitnodigen" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : "";
    const role = String(body.role ?? "");
    if (!email || !email.includes("@")) return json({ status: "error", message: "Geldig e-mailadres verplicht" }, 400);
    if (!ALLOWED_ROLES.includes(role)) return json({ status: "error", message: "Ongeldige rol" }, 400);

    const PUBLIC_URL = (Deno.env.get("PUBLIC_APP_URL") ?? "https://e-charging.nl").replace(/\/+$/, "");
    const redirectTo = `${PUBLIC_URL}/wachtwoord-herstellen`;

    // Maak/uitnodig de auth-user + krijg de actie-link (geen mail via Supabase zelf).
    let { data: linkData } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { full_name: name || undefined, invited_role: role } },
    });
    // Bestaat dit e-mailadres al als gebruiker? Dan faalt 'invite'. Val terug op een
    // 'recovery'-link, zodat een bestaande (rolloze) gebruiker alsnog de rol + toegang
    // krijgt en zijn wachtwoord kan (her)instellen.
    let reinvite = false;
    if (!linkData?.user) {
      const recovery = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      if (recovery.error || !recovery.data?.user) {
        return json({ status: "error", message: recovery.error?.message ?? "Uitnodiging aanmaken mislukt" }, 400);
      }
      linkData = recovery.data;
      reinvite = true;
    }
    const invitedId = linkData.user!.id;
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) return json({ status: "error", message: "Geen actie-link ontvangen" }, 500);

    // Profiel-naam vastleggen (trigger maakt het profiel al aan) + precies één rol zetten.
    if (name) {
      await admin.from("profiles").update({ full_name: name }).eq("user_id", invitedId);
    }
    await admin.from("user_roles").delete().eq("user_id", invitedId);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: invitedId, role });
    if (roleErr) throw roleErr;

    // Branded uitnodiging via Resend (indien geconfigureerd).
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
      const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
      const logoUrl = `${supabaseUrl}/functions/v1/send-client-invitation/logo-v3.png`;
      const html = renderTeamInviteHtml({ name, role, actionLink, logoUrl });
      const text = `Je bent uitgenodigd voor het E-Charging beheer-portaal (rol: ${role}). Activeer je account: ${actionLink}`;
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [email],
          subject: reinvite ? "Je toegang tot het E-Charging beheer-portaal" : "Uitnodiging — E-Charging beheer-portaal",
          html,
          text,
          reply_to: "info@e-charging.nl",
          tags: [{ name: "type", value: "team_invitation" }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Resend team-invite failed:", res.status, errText);
        return json({
          status: "sent_no_email",
          message: `Teamlid aangemaakt, maar de e-mail mislukte (${res.status}). Deel de activatielink handmatig.`,
          action_link: actionLink,
          to: email,
          role,
        }, 200);
      }
    } else {
      // Geen Resend → geef de link terug zodat de admin 'm handmatig kan delen.
      return json({ status: "sent_no_email", message: "Teamlid aangemaakt. Deel de activatielink handmatig (geen e-maildienst ingesteld).", action_link: actionLink, to: email, role }, 200);
    }

    return json({ status: "sent", to: email, role, user_id: invitedId });
  } catch (err) {
    const msg = (err as Error).message ?? "Onbekende fout";
    console.error("invite-team-member failed:", msg);
    return json({ status: "error", message: msg }, 500);
  }
});
