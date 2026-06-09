// Gedeeld, licht en zakelijk mailsjabloon voor het offerteproces.
// Doelgroep: pandeigenaren — rustig, net, helder, professioneel. Table-based +
// inline CSS voor maximale compatibiliteit (Gmail/Outlook), lichte achtergrond.

const LOGO_PATH = "/storage/v1/object/public/blog-media/branding/echarging-logo.png";

export function eur0(n: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

function shell(supabaseUrl: string, innerHtml: string): string {
  const logo = `${supabaseUrl.replace(/\/+$/, "")}${LOGO_PATH}`;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e8eb;border-radius:10px;overflow:hidden">
        <tr><td style="padding:34px 40px 22px;border-bottom:1px solid #f0f1f3">
          <img src="${logo}" alt="E-Charging" width="168" style="display:block;width:168px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none">
        </td></tr>
        <tr><td style="padding:30px 40px 34px;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafbfc;border-top:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;color:#9aa1ab;font-size:11px;line-height:1.7">
          <span style="color:#6b7280;font-weight:700">E-Charging</span> &nbsp;·&nbsp; Dwarsweg 8, 5301 KT Zaltbommel &nbsp;·&nbsp; 0418 684272<br>
          www.e-charging.nl &nbsp;·&nbsp; info@e-charging.nl &nbsp;·&nbsp; KvK 30241843 &nbsp;·&nbsp; BTW NL8213.92.402.B01 &nbsp;·&nbsp; IBAN NL33RABO0143928449
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function btn(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0"><tr>
    <td align="center" style="border-radius:8px;background:#05A500">
      <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a>
    </td></tr></table>`;
}

const eyebrow = (t: string) => `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#05A500;font-weight:700">${t}</p>`;
const h1 = (t: string) => `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#111827;font-weight:700">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#374151">${t}</p>`;
const fine = (t: string) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b7280">${t}</p>`;
const greet = `<p style="margin:22px 0 0;font-size:15px;line-height:1.65;color:#374151">Met vriendelijke groet,<br>Team E-Charging</p>`;

function investBox(total: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;border:1px solid #e6e8eb;border-radius:8px;background:#ffffff">
    <tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif">
      <p style="margin:0;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#6b7280;font-weight:700">Eenmalige investering</p>
      <p style="margin:5px 0 0;font-size:24px;font-weight:800;color:#111827">${eur0(total)} <span style="font-size:13px;font-weight:500;color:#6b7280">excl. BTW</span></p>
      <p style="margin:6px 0 0;font-size:13px;color:#6b7280">Voor de complete oplevering — hardware, montage, aansluiting, NEN-keuring en activatie.</p>
    </td></tr></table>`;
}

// 1) Verstuur-mail (offerte aanbieden). PDF zit altijd als bijlage.
export function renderOfferEmail(o: { supabaseUrl: string; quoteNumber: string; company?: string | null; contact?: string | null; total: number; acceptUrl: string; validUntil?: string | null }): { html: string; text: string } {
  const inner =
    eyebrow(`Offerte ${o.quoteNumber}`) +
    h1("Uw offerte van E-Charging") +
    p(`Geachte ${o.contact || "heer/mevrouw"},`) +
    p(`Hierbij ontvangt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur${o.company ? ` voor <strong>${o.company}</strong>` : ""}. De volledige offerte vindt u als <strong>PDF-bijlage</strong> bij deze e-mail.`) +
    investBox(o.total) +
    p("U kunt de offerte ook online bekijken en direct digitaal ondertekenen:") +
    btn(o.acceptUrl, "Offerte bekijken en ondertekenen") +
    fine(`De link is 30 dagen geldig${o.validUntil ? ` (t/m ${o.validUntil})` : ""}. De Algemene Voorwaarden en Verwerkersovereenkomst E-Charging horen bij deze offerte.`) +
    greet;
  const text = `Geachte ${o.contact || "heer/mevrouw"},

Hierbij ontvangt u ons voorstel voor de levering, installatie en het doorlopende beheer van uw laadinfrastructuur${o.company ? ` voor ${o.company}` : ""}. De volledige offerte vindt u als PDF-bijlage bij deze e-mail.

Eenmalige investering: ${eur0(o.total)} excl. BTW (complete oplevering).

Bekijk en onderteken de offerte online: ${o.acceptUrl}
(30 dagen geldig${o.validUntil ? `, t/m ${o.validUntil}` : ""})

De Algemene Voorwaarden en Verwerkersovereenkomst E-Charging horen bij deze offerte.

Met vriendelijke groet,
Team E-Charging
Dwarsweg 8, 5301 KT Zaltbommel · 0418 684272 · info@e-charging.nl`;
  return { html: shell(o.supabaseUrl, inner), text };
}

// 2) Klant-bevestiging na ondertekenen (getekende PDF als bijlage).
export function renderSignedConfirmation(o: { supabaseUrl: string; quoteNumber: string; signerName: string; total: number }): { html: string; text: string } {
  const inner =
    eyebrow(`Offerte ${o.quoteNumber}`) +
    h1("Bedankt — uw offerte is ondertekend") +
    p(`Geachte ${o.signerName},`) +
    p(`Hartelijk dank voor uw akkoord op offerte <strong>${o.quoteNumber}</strong> (eenmalige investering ${eur0(o.total)} excl. BTW). De getekende offerte vindt u als PDF-bijlage bij deze e-mail.`) +
    p("Wij nemen op korte termijn contact met u op voor de planning van de installatie. Heeft u vragen? Mail ons gerust via info@e-charging.nl.") +
    greet;
  const text = `Geachte ${o.signerName},

Hartelijk dank voor uw akkoord op offerte ${o.quoteNumber} (eenmalige investering ${eur0(o.total)} excl. BTW). De getekende offerte vindt u als PDF-bijlage bij deze e-mail.

Wij nemen op korte termijn contact met u op voor de planning van de installatie. Heeft u vragen? Mail ons via info@e-charging.nl.

Met vriendelijke groet,
Team E-Charging`;
  return { html: shell(o.supabaseUrl, inner), text };
}

// 3) Interne melding naar e-charging.
export function renderInternalSignedNotice(o: { supabaseUrl: string; quoteNumber: string; company?: string | null; signerName: string; total: number }): { html: string; text: string } {
  const inner =
    eyebrow("Offerte getekend") +
    h1(`${o.company || "Een klant"} heeft getekend`) +
    p(`Offerte <strong>${o.quoteNumber}</strong> is zojuist digitaal ondertekend.`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.9">
      <tr><td style="color:#6b7280">Bedrijf</td><td style="padding-left:18px;font-weight:600;color:#111827">${o.company || "—"}</td></tr>
      <tr><td style="color:#6b7280">Getekend door</td><td style="padding-left:18px;font-weight:600;color:#111827">${o.signerName}</td></tr>
      <tr><td style="color:#6b7280">Investering</td><td style="padding-left:18px;font-weight:600;color:#111827">${eur0(o.total)} excl. BTW</td></tr>
    </table>` +
    fine("Een klantaccount en installatie-order zijn automatisch aangemaakt. De getekende offerte zit als bijlage.");
  const text = `${o.company || "Een klant"} heeft offerte ${o.quoteNumber} digitaal getekend.
Getekend door: ${o.signerName}
Investering: ${eur0(o.total)} excl. BTW
Klantaccount + installatie-order automatisch aangemaakt. Getekende offerte als bijlage.`;
  return { html: shell(o.supabaseUrl, inner), text };
}
