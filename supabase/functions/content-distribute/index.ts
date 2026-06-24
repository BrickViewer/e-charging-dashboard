/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// Content-distributie: drukt pending content_distributions-rijen af.
// - newsletter → Resend-mail naar de ontvangers uit content_engine_settings.newsletter_recipients.
// - linkedin   → blijft 'pending' (agent-gedreven via Hey_Reach MCP; zie docs).
// Internal-auth, cron-baar. No-op zonder pending of zonder ontvangers.

const SITE = "https://e-charging.nl";
const BLOG_PATH = "/kennisbank";
const cors = CORS_INTERNAL;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  try {
    const auth = await requireAdminOrInternal(req, sb, cors);
    if (!auth.ok) return auth.response;

    const { data: settingsRow } = await sb.from("content_engine_settings").select("settings").eq("is_active", true).limit(1).maybeSingle();
    const settings = (settingsRow?.settings ?? {}) as any;
    const recipients: string[] = Array.isArray(settings.newsletter_recipients) ? settings.newsletter_recipients.filter(Boolean) : [];

    const { data: pending } = await sb
      .from("content_distributions")
      .select("id, content_ref_id, channel")
      .eq("channel", "newsletter").eq("status", "pending").limit(50);

    let sent = 0, failed = 0;
    const rows = pending ?? [];
    if (rows.length === 0) return json({ status: "ok", sent: 0, failed: 0, message: "geen pending nieuwsbrief-items" });
    if (recipients.length === 0) return json({ status: "ok", sent: 0, failed: 0, message: "geen ontvangers ingesteld" });

    for (const row of rows) {
      const { data: post } = await sb
        .from("blog_posts")
        .select("title, excerpt, slug, cover_image_url")
        .eq("id", row.content_ref_id as string).maybeSingle();
      if (!post) {
        await sb.from("content_distributions").update({ status: "skipped", error: "blog niet gevonden" }).eq("id", row.id);
        continue;
      }
      const url = `${SITE}${BLOG_PATH}/${post.slug}`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        ${post.cover_image_url ? `<img src="${esc(post.cover_image_url)}" alt="" style="width:100%;border-radius:8px"/>` : ""}
        <h1 style="font-size:20px;color:#111">${esc(post.title)}</h1>
        <p style="color:#444;font-size:15px;line-height:1.6">${esc(post.excerpt ?? "")}</p>
        <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Lees verder</a></p>
        <p style="color:#999;font-size:12px">E-Charging — ${url}</p>
      </div>`;
      const text = `${post.title}\n\n${post.excerpt ?? ""}\n\nLees verder: ${url}`;
      try {
        const res = await sendEmail({
          to: recipients, subject: post.title, html, text,
          tags: [{ name: "type", value: "blog-nieuwsbrief" }],
        });
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          await sb.from("content_distributions").update({ status: "sent", sent_at: new Date().toISOString(), external_id: (body as any)?.id ?? null }).eq("id", row.id);
          sent++;
        } else {
          await sb.from("content_distributions").update({ status: "failed", error: `Resend ${res.status}` }).eq("id", row.id);
          failed++;
        }
      } catch (e) {
        await sb.from("content_distributions").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
        failed++;
      }
    }
    return json({ status: "ok", sent, failed, processed: rows.length });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
