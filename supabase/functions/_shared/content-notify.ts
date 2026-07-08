// Vangnet-notificatie voor de content-engine: mail zodra een autoblog-run eindigt ZONDER
// gepubliceerde blog (concept blijft in review, lege pool, ontbrekende sleutel, of run-fout).
// Zonder deze mail blijft zo'n uitkomst onzichtbaar tot iemand mist dat er geen blog staat.
// Ontvanger = settings.notify_email (leeg = geen mail). Volledig best-effort: een mailfout
// mag de run nooit breken. Stijl spiegelt order-handoff/handoff-email.ts (donkere kaart,
// enkele quotes in HTML-attributen voor robuuste deploy), afzender noreply@ (systeemmail).

import { sendEmail } from "./email.ts";
import { logoBrightUrl } from "./email-assets.ts";

export type ContentNotifyKind = "kept_concept" | "empty_pool" | "no_key" | "run_failed";

export interface ContentNotifyParams {
  kind: ContentNotifyKind;
  title?: string | null;                                   // blogtitel (kept_concept)
  scores?: { quality?: number | null; seo?: number | null; aeo?: number | null };
  reason?: string | null;                                  // korte uitleg voor in de mail
  blogPostId?: string | null;                              // deeplink naar de blog-editor
  details?: string[];                                      // foutregels (run_failed)
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const HEADLINE: Record<ContentNotifyKind, { badge: string; subject: string; intro: string }> = {
  kept_concept: {
    badge: "Blog in review",
    subject: "Autoblog: blog bleef in review — actie nodig",
    intro: "De autoblog-run heeft een blog geschreven, maar die haalde na het maximale aantal revisierondes de kwaliteitsvloer niet. De blog staat als concept ter review en gaat NIET vanzelf live.",
  },
  empty_pool: {
    badge: "Geen onderwerpen",
    subject: "Autoblog: geen onderwerpen in de pool — geen blog vandaag",
    intro: "De geplande autoblog-run vond geen bruikbaar onderwerp in de pool. Er verschijnt vandaag geen blog. Haal nieuws op of keur onderwerpen goed in de pijplijn.",
  },
  no_key: {
    badge: "Configuratie",
    subject: "Autoblog: Claude-sleutel ontbreekt — geen blog gegenereerd",
    intro: "De geplande autoblog-run kon niet draaien omdat de Claude-sleutel (ANTHROPIC_API_KEY) ontbreekt. Er verschijnt geen blog totdat de sleutel is ingesteld.",
  },
  run_failed: {
    badge: "Run mislukt",
    subject: "Autoblog: run eindigde zonder publicatie",
    intro: "De geplande autoblog-run is afgerond zonder gepubliceerde blog. Bekijk de details hieronder.",
  },
};

// deno-lint-ignore no-explicit-any
export async function notifyContentEngine(settings: any, p: ContentNotifyParams): Promise<void> {
  try {
    const to = typeof settings?.notify_email === "string" ? settings.notify_email.trim() : "";
    if (!to) return;

    const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://dashboard.e-charging.nl").replace(/\/+$/, "");
    const link = p.blogPostId ? `${appUrl}/marketing/blogs/${p.blogPostId}` : `${appUrl}/marketing/content`;
    const linkLabel = p.blogPostId ? "Bekijk de blog in de review" : "Open de content-pijplijn";
    const h = HEADLINE[p.kind];

    const row = (label: string, value: string) => value
      ? `<tr>
          <td style='padding:6px 0;font-size:12px;color:#73818b;vertical-align:top;white-space:nowrap;width:110px;'>${escapeHtml(label)}</td>
          <td style='padding:6px 0;font-size:13px;color:#ffffff;vertical-align:top;'>${escapeHtml(value)}</td>
        </tr>`
      : "";
    const scoreLine = p.scores
      ? ["kwaliteit", "seo", "aeo"].map((k) => {
          const v = (p.scores as Record<string, number | null | undefined>)[k === "kwaliteit" ? "quality" : k];
          return typeof v === "number" ? `${k} ${v}` : null;
        }).filter(Boolean).join(" · ")
      : "";
    const detailRows = [
      row("Blog", p.title?.trim() ?? ""),
      row("Scores", scoreLine),
      row("Reden", p.reason?.trim() ?? ""),
      ...(p.details ?? []).slice(0, 5).map((d) => row("Fout", d)),
    ].join("");

    const html = `<!DOCTYPE html>
<html lang='nl'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>${escapeHtml(h.subject)}</title></head>
<body style='margin:0;padding:0;background:#05080a;'>
  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#05080a;'>
    <tr><td align='center' style='padding:28px 16px;'>
      <table role='presentation' width='560' cellpadding='0' cellspacing='0' style='width:560px;max-width:100%;background:#0b0f13;border:1px solid #1c252b;border-radius:18px;overflow:hidden;'>
        <tr><td style='padding:24px 24px 8px 24px;'>
          <img src='${escapeHtml(logoBrightUrl)}' alt='E-Charging' height='28' style='height:28px;width:auto;display:block;'>
        </td></tr>
        <tr><td style='padding:8px 24px 0 24px;'>
          <div style='display:inline-block;background:#2a1c0e;color:#e0b47e;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 12px;border-radius:999px;'>${escapeHtml(h.badge)}</div>
          <h1 style='font-size:20px;line-height:1.3;color:#ffffff;margin:14px 0 6px 0;'>Geen blog gepubliceerd</h1>
          <p style='font-size:14px;color:#9aa7b0;margin:0 0 18px 0;line-height:1.6;'>${escapeHtml(h.intro)}</p>
        </td></tr>
        ${detailRows ? `<tr><td style='padding:0 24px 8px 24px;'>
          <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#0b0f13;border:1px solid #1c252b;border-radius:12px;'>
            <tr><td style='padding:16px 18px;'>
              <table role='presentation' width='100%' cellpadding='0' cellspacing='0'>${detailRows}</table>
            </td></tr>
          </table>
        </td></tr>` : ""}
        <tr><td style='padding:10px 24px 26px 24px;'>
          <a href='${escapeHtml(link)}' style='display:inline-block;background:#16a34a;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:10px 22px;border-radius:10px;'>${escapeHtml(linkLabel)}</a>
          <p style='font-size:12px;color:#5e6a73;margin:16px 0 0 0;'>Deze melding is automatisch verstuurd door het E-Charging dashboard. Instelbaar via Marketing &rarr; Content-engine instellingen.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const text = [
      h.subject,
      "",
      h.intro,
      p.title?.trim() ? `Blog: ${p.title.trim()}` : "",
      scoreLine ? `Scores: ${scoreLine}` : "",
      p.reason?.trim() ? `Reden: ${p.reason.trim()}` : "",
      ...(p.details ?? []).slice(0, 5).map((d) => `Fout: ${d}`),
      "",
      `${linkLabel}: ${link}`,
    ].filter((l) => l !== "").join("\n");

    await sendEmail({ to, subject: h.subject, html, text, sender: "noreply" });
  } catch {
    // Best-effort: notificatie mag de run nooit laten falen.
  }
}
