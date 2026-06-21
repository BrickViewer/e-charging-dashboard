// Gedeelde Resend-transport. sendEmail doet ALLEEN de POST naar Resend en geeft de
// RAUWE Response terug — elke caller houdt zo z'n eigen error-policy (stil swallowen /
// 200 anti-enumeratie / 502 / throw). `from` en de API-key komen uit dezelfde env-
// defaults als voorheen; `to` wordt naar een array gewikkeld; `reply_to` default
// info@e-charging.nl; `tags`/`attachments` alleen meegestuurd wanneer aanwezig — zodat
// de verzonden body per caller hetzelfde veldenpalet houdt als de oude inline-fetch.

export const RESEND_API = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;        // default `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`
  replyTo?: string;     // default "info@e-charging.nl"
  tags?: { name: string; value: string }[];
  attachments?: { filename: string; content: string }[];
}

export function sendEmail(input: SendEmailInput): Promise<Response> {
  const key = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@e-charging.nl";
  const fromName = Deno.env.get("RESEND_FROM_NAME") ?? "E-Charging";
  const body: Record<string, unknown> = {
    from: input.from ?? `${fromName} <${fromEmail}>`,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    reply_to: input.replyTo ?? "info@e-charging.nl",
  };
  if (input.tags) body.tags = input.tags;
  if (input.attachments && input.attachments.length) body.attachments = input.attachments;
  return fetch(RESEND_API, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
