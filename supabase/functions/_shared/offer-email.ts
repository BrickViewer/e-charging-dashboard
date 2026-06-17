// Gedeeld, licht en zakelijk mailsjabloon voor het offerteproces.
// Doelgroep: pandeigenaren — rustig, net, helder, professioneel. Table-based +
// inline CSS, bulletproof (VML) knop, NL-datums, robuust in Gmail/Outlook/Apple Mail.

const LOGO_PATH = "/storage/v1/object/public/blog-media/branding/echarging-logo.png";

export function eur0(n: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

// "2026-07-09" → "9 juli 2026" (valt netjes terug op de invoer bij een rare waarde).
function nlDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function shell(supabaseUrl: string, innerHtml: string): string {
  const logo = `${supabaseUrl.replace(/\/+$/, "")}${LOGO_PATH}`;
  return `<!doctype html>
<html lang="nl" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<!--[if mso]><style>table,td,a{border-collapse:collapse !important;mso-table-lspace:0pt !important;mso-table-rspace:0pt !important;mso-line-height-rule:exactly}</style>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  :root{color-scheme:light only;supported-color-schemes:light}
  @media (prefers-color-scheme:dark){
    .ec-bg{background:#f4f5f7 !important} .ec-card{background:#ffffff !important} .ec-foot{background:#fafbfc !important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-font-smoothing:antialiased">
  <table role="presentation" class="ec-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" class="ec-card" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e8eb;border-radius:10px;overflow:hidden">
        <tr><td style="padding:34px 40px 22px;border-bottom:1px solid #f0f1f3">
          <img src="${logo}" alt="E-Charging" width="168" height="40" style="display:block;width:168px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700">
        </td></tr>
        <tr><td style="padding:30px 40px 34px;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
          ${innerHtml}
        </td></tr>
        <tr><td class="ec-foot" style="padding:20px 40px;background:#fafbfc;border-top:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;color:#9aa1ab;font-size:11px;line-height:1.8">
          <span style="color:#6b7280;font-weight:700">E-Charging</span><br>
          Dwarsweg 8, 5301 KT Zaltbommel · 0418 684272<br>
          www.e-charging.nl · info@e-charging.nl<br>
          KvK 30241843 · BTW NL8213.92.402.B01 · IBAN NL33RABO0143928449
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Bulletproof CTA-knop: VML-roundrect voor Outlook, gewone &lt;a&gt; voor de rest.
function btn(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0"><tr><td align="left">
  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:330px;" arcsize="16%" stroke="f" fillcolor="#05A500"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->
  <!--[if !mso]><!-- --><a href="${url}" style="display:inline-block;background:#05A500;border-radius:8px;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;mso-padding-alt:0;line-height:100%">${label}</a><!--<![endif]-->
</td></tr></table>`;
}

const eyebrow = (t: string) => `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#05A500;font-weight:700">${t}</p>`;
const h1 = (t: string) => `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#111827;font-weight:700">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#374151">${t}</p>`;
const fine = (t: string) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">${t}</p>`;
const greet = `<p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:#374151">Met vriendelijke groet,<br>Team E-Charging</p>`;

// "Beste {naam}," bij een bekende naam (correct bij voornaam+achternaam), anders
// het formele "Geachte heer/mevrouw,".
const aanhef = (naam?: string | null) => p(naam && naam.trim() ? `Beste ${naam.trim()},` : "Geachte heer/mevrouw,");

// 1) Verstuur-mail (offerte aanbieden). De PDF zit als bijlage wanneer hasAttachment.
// Bewust GEEN bedrag in de mailtekst: de mail is een korte, adviserende uitnodiging;
// de volledige offerte (incl. investering) bekijkt de klant via de knop/PDF.
export function renderOfferEmail(o: { supabaseUrl: string; quoteNumber: string; company?: string | null; contact?: string | null; total: number; acceptUrl: string; validUntil?: string | null; hasAttachment?: boolean }): { html: string; text: string } {
  const vu = nlDate(o.validUntil);
  const bijlageZin = o.hasAttachment ? "De volledige offerte vindt u als <strong>PDF-bijlage</strong> bij deze e-mail." : "";
  const inner =
    eyebrow(`Offerte ${o.quoteNumber}`) +
    h1(o.company ? `Voorstel voor ${o.company}` : "Uw voorstel voor laadinfrastructuur") +
    aanhef(o.contact) +
    p(`Hierbij ontvangt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur. ${bijlageZin}`) +
    p("In de offerte leest u de volledige uitwerking: de hardware, de installatie, het doorlopende beheer en de tarieven. Bekijk de offerte online en onderteken direct digitaal via onderstaande knop.") +
    btn(o.acceptUrl, "Offerte bekijken en ondertekenen") +
    fine(`${vu ? `Deze offerte is geldig t/m ${vu}.` : "Deze offerte is 30 dagen geldig."} De Algemene Voorwaarden en Verwerkersovereenkomst E-Charging horen bij deze offerte.`) +
    greet;
  const text = `${o.contact ? `Beste ${o.contact},` : "Geachte heer/mevrouw,"}

Hierbij ontvangt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur.${o.hasAttachment ? " De volledige offerte vindt u als PDF-bijlage bij deze e-mail." : ""}

In de offerte leest u de volledige uitwerking: de hardware, de installatie, het doorlopende beheer en de tarieven.

Bekijk en onderteken de offerte online: ${o.acceptUrl}
${vu ? `Deze offerte is geldig t/m ${vu}.` : "Deze offerte is 30 dagen geldig."}

De Algemene Voorwaarden en Verwerkersovereenkomst E-Charging horen bij deze offerte.

Met vriendelijke groet,
Team E-Charging
Dwarsweg 8, 5301 KT Zaltbommel · 0418 684272 · info@e-charging.nl`;
  return { html: shell(o.supabaseUrl, inner), text };
}

// 2) Klant-bevestiging na ondertekenen (getekende PDF als bijlage).
export function renderSignedConfirmation(o: { supabaseUrl: string; quoteNumber: string; signerName: string; total: number; hasAttachment?: boolean }): { html: string; text: string } {
  const bijlage = o.hasAttachment ? " De getekende offerte vindt u als PDF-bijlage bij deze e-mail." : "";
  const inner =
    eyebrow(`Offerte ${o.quoteNumber}`) +
    h1("Bedankt — uw offerte is ondertekend") +
    aanhef(o.signerName) +
    p(`Hartelijk dank voor uw akkoord op offerte <strong>${o.quoteNumber}</strong> (eenmalige investering ${eur0(o.total)} excl. BTW).${bijlage}`) +
    p("Een van onze adviseurs neemt binnen 2 werkdagen contact met u op om de installatie in te plannen. Heeft u vragen? Mail ons gerust via info@e-charging.nl.") +
    greet;
  const text = `Beste ${o.signerName},

Hartelijk dank voor uw akkoord op offerte ${o.quoteNumber} (eenmalige investering ${eur0(o.total)} excl. BTW).${o.hasAttachment ? " De getekende offerte vindt u als PDF-bijlage bij deze e-mail." : ""}

Een van onze adviseurs neemt binnen 2 werkdagen contact met u op om de installatie in te plannen. Heeft u vragen? Mail ons via info@e-charging.nl.

Met vriendelijke groet,
Team E-Charging`;
  return { html: shell(o.supabaseUrl, inner), text };
}

// 3) Interne melding naar e-charging.
export function renderInternalSignedNotice(o: { supabaseUrl: string; quoteNumber: string; company?: string | null; signerName: string; total: number }): { html: string; text: string } {
  const inner =
    eyebrow("Offerte ondertekend") +
    h1(o.company || "Nieuwe ondertekening") +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:26px">
      <tr><td width="130" style="color:#6b7280">Offerte</td><td style="font-weight:600;color:#111827">${o.quoteNumber}</td></tr>
      <tr><td width="130" style="color:#6b7280">Getekend door</td><td style="font-weight:600;color:#111827">${o.signerName}</td></tr>
      <tr><td width="130" style="color:#6b7280">Investering</td><td style="font-weight:600;color:#111827">${eur0(o.total)} excl. BTW</td></tr>
    </table>` +
    fine("Een klantaccount en installatie-order zijn automatisch aangemaakt. De getekende offerte zit als bijlage.");
  const text = `${o.company || "Een klant"} heeft offerte ${o.quoteNumber} digitaal ondertekend.
Getekend door: ${o.signerName}
Investering: ${eur0(o.total)} excl. BTW
Klantaccount + installatie-order automatisch aangemaakt. Getekende offerte als bijlage.`;
  return { html: shell(o.supabaseUrl, inner), text };
}
