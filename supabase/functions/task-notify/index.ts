/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_INTERNAL } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

// task-notify: stuurt de toegewezen persoon een e-mail dat er een taak voor hem klaarstaat. Wordt aangeroepen
// door de DB-trigger op lead_tasks (via invoke_edge_function, x-internal-secret). verify_jwt = false.

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
    const taskId = typeof body.task_id === "string" ? body.task_id : "";
    if (!taskId) return json({ status: "error", message: "task_id ontbreekt" }, 400);

    const { data: task } = await sb.from("lead_tasks")
      .select("id, title, description, priority, due_date, assigned_to, lead_id").eq("id", taskId).maybeSingle();
    if (!task || !task.assigned_to) return json({ status: "ignored" });

    const { data: userRes } = await sb.auth.admin.getUserById(task.assigned_to);
    const email = userRes?.user?.email;
    if (!email) return json({ status: "ignored", message: "Geen e-mailadres voor de toegewezene" });

    const { data: prof } = await sb.from("profiles").select("full_name").eq("user_id", task.assigned_to).maybeSingle();
    const name = (prof?.full_name as string | null)?.split(" ")[0] || "collega";

    let company: string | null = null;
    if (task.lead_id) {
      const { data: lead } = await sb.from("leads").select("company_name").eq("id", task.lead_id).maybeSingle();
      company = (lead?.company_name as string | null) ?? null;
    }

    const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");
    const tasksUrl = `${appUrl}/sales/taken`;
    const due = task.due_date ? new Date(task.due_date as string).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : null;
    // Alleen hoge prioriteit expliciet benoemen; normaal/laag is ruis in een toewijzingsmail.
    const isHigh = task.priority === "high";
    const description = ((task.description as string | null) ?? "").trim();

    const lines = [
      `Er is een taak aan je toegewezen:`,
      `Taak: ${task.title}`,
      isHigh ? `Prioriteit: Hoog` : null,
      due ? `Deadline: ${due}` : null,
      company ? `Lead: ${company}` : null,
      description ? `\n${description}` : null,
      `Bekijk je taken: ${tasksUrl}`,
    ].filter(Boolean) as string[];
    const text = `Hoi ${name},\n\n${lines.join("\n")}\n\nGroet, E-Charging`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.6">
      <p>Hoi ${esc(name)},</p>
      <p>Er is een taak aan je toegewezen:</p>
      <p style="padding:12px 14px;background:#f3f4f6;border-radius:8px">
        <strong>${esc(task.title as string)}</strong>
        ${isHigh ? `<br/><span style="color:#dc2626;font-weight:600">Prioriteit: Hoog</span>` : ""}
        ${due ? `<br/>Deadline: ${esc(due)}` : ""}
        ${company ? `<br/>Lead: ${esc(company)}` : ""}
        ${description ? `<br/><br/><span style="color:#374151">${esc(description)}</span>` : ""}
      </p>
      <p><a href="${tasksUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#fff;border-radius:8px;text-decoration:none">Bekijk je taken</a></p>
      <p style="color:#6b7280">Groet, E-Charging</p>
    </div>`;

    const res = await sendEmail({
      to: [email],
      subject: `Nieuwe taak voor jou: ${task.title}`,
      html, text,
      tags: [{ name: "type", value: "task_assigned" }],
    });
    if (!res.ok) return json({ status: "send_failed", message: `Resend gaf ${res.status}` }, 502);

    return json({ status: "sent", to: email });
  } catch (e) {
    return json({ status: "error", message: (e as Error).message }, 500);
  }
});
