// De twee mails rond een offerteaanvraag, op de bestaande huisstijl (_shared/offer-email.ts):
//   1. bevestiging aan de aanvrager  — formeel "u", zelfde toon als de website;
//   2. interne melding aan E-Charging — informeel "je", zoals in het dashboard.
// Bewust GEEN links naar de geüploade foto's in de mail: dat zijn persoonsgegevens
// (iemands woning en meterkast). Die bekijk je in het dashboard, achter een login.

import { btn, escHtml, eyebrow, fine, greet, h1, p, shell } from "../_shared/offer-email.ts";
import { TRIAGE_LABEL, type Flow, type Triage } from "./labels.ts";

/** Vaste-breedte samenvatting in een grijs blok; \n blijft \n. */
function pre(text: string): string {
  return `<pre style="margin:18px 0 0;padding:16px 18px;background:#f6f7f9;border:1px solid #eceef1;border-radius:8px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:12.5px;line-height:1.65;color:#374151;white-space:pre-wrap;word-break:break-word">${escHtml(text)}</pre>`;
}

function rows(items: Array<[string, string]>): string {
  const trs = items
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:44%">${escHtml(k)}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${escHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;border-top:1px solid #f0f1f3">${trs}</table>`;
}

/* ─────────────────────── bevestiging aan de aanvrager ─────────────────────── */

export function renderIntakeConfirmation(o: {
  flow: Flow;
  naam: string;
  samenvatting: Array<[string, string]>;
}): { html: string; text: string } {
  const verwachting =
    o.flow === "particulier"
      ? "Wij bekijken uw aanvraag en sturen u een passende offerte. Heeft u foto's overgeslagen, dan kan het zijn dat wij u nog even bellen of mailen."
      : "Wij nemen contact met u op voor advies en de vervolgstappen.";

  const inner = [
    eyebrow("Aanvraag ontvangen"),
    h1("Bedankt voor uw offerteaanvraag"),
    p(o.naam ? `Beste ${escHtml(o.naam)},` : "Geachte heer/mevrouw,"),
    p("Wij hebben uw aanvraag goed ontvangen. U hoeft verder niets te doen."),
    p(`<strong>Wat u kunt verwachten:</strong> ${verwachting}`),
    rows(o.samenvatting),
    fine(
      "Heeft u tussentijds een vraag? Reageer gerust op deze e-mail of mail naar info@e-charging.nl. Wij reageren binnen twee werkdagen.",
    ),
    greet,
  ].join("");

  const text = [
    o.naam ? `Beste ${o.naam},` : "Geachte heer/mevrouw,",
    "",
    "Bedankt voor uw offerteaanvraag. Wij hebben alles goed ontvangen.",
    "",
    `Wat u kunt verwachten: ${verwachting}`,
    "",
    ...o.samenvatting.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    "Heeft u een vraag? Reageer op deze e-mail of mail naar info@e-charging.nl.",
    "",
    "Met vriendelijke groet,",
    "Team E-Charging",
  ].join("\n");

  return { html: shell("", inner), text };
}

/* ─────────────────────── interne melding aan E-Charging ─────────────────────── */

export function renderInternalIntakeNotice(o: {
  flow: Flow;
  triage: Triage;
  titel: string;
  samenvatting: string;
  leadUrl: string;
  aantalBestanden: number;
  vervolgactie: string;
}): { html: string; text: string } {
  const bestanden =
    o.aantalBestanden > 0
      ? `${o.aantalBestanden} foto's of video's toegevoegd. Bekijk ze in het dashboard, bij de lead onder het tabblad Aanvraag.`
      : "Geen foto's of video's toegevoegd.";

  const inner = [
    eyebrow(`Nieuwe offerteaanvraag ${o.flow}`),
    h1(escHtml(o.titel)),
    p(`<strong>Triage:</strong> ${escHtml(TRIAGE_LABEL[o.triage])}`),
    p(`<strong>Vervolgactie:</strong> ${escHtml(o.vervolgactie)} Er staat al een taak klaar bij de lead.`),
    p(escHtml(bestanden)),
    btn(o.leadUrl, "Bekijk de aanvraag"),
    pre(o.samenvatting),
  ].join("");

  const text = [
    `Nieuwe offerteaanvraag (${o.flow})`,
    o.titel,
    "",
    `Triage: ${TRIAGE_LABEL[o.triage]}`,
    `Vervolgactie: ${o.vervolgactie}`,
    bestanden,
    "",
    `Bekijk de aanvraag: ${o.leadUrl}`,
    "",
    o.samenvatting,
  ].join("\n");

  return { html: shell("", inner), text };
}
