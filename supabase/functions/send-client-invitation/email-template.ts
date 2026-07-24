// E-Charging branded HTML email template voor klantuitnodigingen.
// Inline styling is bewust gebruikt voor brede ondersteuning in email clients.

interface InviteEmailParams {
  companyName: string;
  contactName: string;
  inviteUrl: string;
  expiresInDays: number;
  fromName: string;
  heroUrl: string;
  clientNumber?: number | null;
  /** installatie+beheer (managed + needs_installation): begeleidende "maak alvast je account
   *  aan, wij koppelen straks je palen"-tekst, want de uitnodiging gaat nu vóór het koppelen. */
  needsInstallation?: boolean;
}

/** Ingestelde teksten uit email_templates (sleutel "klant-portaaluitnodiging"), al met
 *  placeholders ingevuld. Niet meegegeven → de standaardteksten hieronder. Het HTML-ONTWERP
 *  (hero, samenvattingsblokken, knop, voettekst) blijft hoe dan ook zoals het is. */
export function renderInviteEmail(
  p: InviteEmailParams,
  slots?: Record<string, string>,
  slotsText?: Record<string, string>,
): { subject: string; html: string; text: string } {
  // installatie+beheer: klant wordt direct na tekenen uitgenodigd, vóór de installateur de
  // palen plaatst/koppelt → begeleidende toon. Alleen-beheer houdt "portaal staat klaar".
  const guiding = p.needsInstallation === true;
  // Slots winnen; ontbreken ze, dan exact de tekst die hier altijd al stond.
  const S = (naam: string, standaard: string) => slots?.[naam] ?? standaard;
  const T = (naam: string, standaard: string) => slotsText?.[naam] ?? slots?.[naam] ?? standaard;
  const subject = guiding
    ? T("onderwerp_installatie", "Maak alvast uw E-Charging account aan")
    : T("onderwerp_standaard", "Activeer uw E-Charging klantportaal");
  const companyName = escapeHtml(p.companyName);
  const contactName = escapeHtml(p.contactName);
  const inviteUrl = escapeHtml(p.inviteUrl);
  const fromName = escapeHtml(p.fromName);
  const heroUrl = escapeHtml(p.heroUrl);
  const clientNumber = typeof p.clientNumber === "number" ? `#${p.clientNumber}` : "Wordt gekoppeld";
  // Particulier: bedrijfsnaam == contactnaam → "Beste X, Voor X is het portaal voorbereid" leest dubbelop.
  // Dan een neutrale zin zonder de naam te herhalen.
  const isPrivate =
    !!p.companyName && !!p.contactName &&
    p.companyName.trim().toLowerCase() === p.contactName.trim().toLowerCase();
  const introHtml = guiding
    ? S("intro_installatie", "Uw offerte is getekend — u kunt nu alvast uw E-Charging account aanmaken. Zodra wij uw laadpalen hebben geplaatst en gekoppeld, ziet u meteen live sessies, geleverde kWh en uw maandafrekeningen in het portaal.")
    : isPrivate
    ? S("intro_particulier", "Uw E-Charging klantportaal staat klaar. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.")
    : S("intro_zakelijk", `Voor ${companyName} is het E-Charging klantportaal voorbereid. Via dit portaal ziet u live sessies, geleverde kWh en de definitieve maandafrekeningen zodra E-Charging deze heeft goedgekeurd.`);
  const introText = guiding
    ? T("intro_installatie", "Uw offerte is getekend — u kunt nu alvast uw E-Charging account aanmaken. Zodra wij uw laadpalen hebben gekoppeld, ziet u alles live in het portaal.")
    : isPrivate
    ? T("intro_particulier", "Uw E-Charging klantportaal staat klaar.")
    : T("intro_zakelijk", `Voor ${p.companyName} is het E-Charging klantportaal voorbereid.`);
  // De laatste "na activatie"-stap verschilt per scope: bij installatie+beheer koppelen
  // wij binnenkort de palen; bij alleen-beheer koppelen wij de bestaande locaties.
  const step3Html = guiding
    ? S("stap3_installatie", "3. Wij plaatsen en koppelen binnenkort uw laadpalen; daarna staat alles live in uw portaal.")
    : S("stap3_beheer", "3. E-Charging koppelt de juiste locaties aan uw klantprofiel.");
  const step3Text = guiding
    ? T("stap3_installatie", "3. Wij plaatsen en koppelen binnenkort uw laadpalen; daarna staat alles live in uw portaal.")
    : T("stap3_beheer", "3. E-Charging koppelt de juiste locaties aan uw klantprofiel.");

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${subject}</title>
  <style>
    :root {
      color-scheme: dark light;
      supported-color-schemes: dark light;
    }
    @media only screen and (max-width: 600px) {
      .email-shell {
        background: #f3f6fa !important;
        padding: 0 !important;
      }
      .email-card {
        width: 100% !important;
        max-width: 100% !important;
        border-color: #cfe4d5 !important;
        border-radius: 18px !important;
        background: #f3f6fa !important;
      }
      .hero-cell {
        padding: 0 !important;
        background: #041008 !important;
        font-size: 0 !important;
        line-height: 0 !important;
      }
      .hero-image {
        display: block !important;
        width: 100% !important;
        height: auto !important;
        vertical-align: top !important;
      }
      .body-cell {
        background: #f3f6fa !important;
        padding: 22px 20px 28px !important;
      }
      .summary-table {
        margin-bottom: 22px !important;
      }
      .summary-column,
      .summary-spacer {
        display: block !important;
        width: 100% !important;
      }
      .summary-spacer {
        height: 14px !important;
      }
      .summary-box {
        background: #ffffff !important;
        border-color: #d7e1ee !important;
        box-sizing: border-box !important;
        width: 100% !important;
      }
      .summary-box-green {
        background: #eaf7ec !important;
        border-color: #9ac69e !important;
      }
      .summary-inner {
        height: auto !important;
        min-height: 0 !important;
        padding: 14px 16px !important;
      }
      .summary-label {
        color: #667085 !important;
        font-size: 10px !important;
      }
      .summary-value {
        color: #101828 !important;
        font-size: 18px !important;
        line-height: 1.25 !important;
      }
      .summary-value-green {
        color: #188038 !important;
      }
      .mobile-body-copy {
        color: #334155 !important;
        font-size: 16px !important;
        line-height: 1.68 !important;
      }
      .cta-link {
        box-sizing: border-box !important;
        display: block !important;
        width: 100% !important;
        padding: 16px 18px !important;
        text-align: center !important;
      }
      .steps-panel {
        background: #ffffff !important;
        border-color: #d7e1ee !important;
        padding: 16px !important;
      }
      .steps-title {
        color: #101828 !important;
      }
      .steps-copy {
        color: #475467 !important;
        font-size: 14px !important;
        line-height: 1.55 !important;
      }
      .expiry-copy {
        color: #64748b !important;
      }
      .expiry-strong {
        color: #334155 !important;
      }
      .footer-cell {
        background: #ecf1f5 !important;
        padding: 22px 22px 26px !important;
      }
      .footer-copy {
        color: #475467 !important;
        font-size: 13px !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#05080a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#f8fafc;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="email-shell" style="background:#05080a; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" class="email-card" style="width:100%; max-width:640px; overflow:hidden; border-radius:22px; border:1px solid #164726; background:#0b0f13; box-shadow:0 28px 80px rgba(0,0,0,0.45);">
          <tr>
            <td class="hero-cell" style="padding:0; background:#061109; font-size:0; line-height:0;">
              <img src="${heroUrl}" alt="E-Charging. Uw klantportaal staat klaar. Activeer uw account en vul daarna uw klantgegevens aan." width="640" height="210" class="hero-image" style="display:block; width:100%; max-width:640px; height:auto; border:0; outline:none; text-decoration:none; vertical-align:top;">
            </td>
          </tr>

          <tr>
            <td class="body-cell" style="padding:34px 40px 38px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="summary-table" style="margin:0 0 26px;">
                <tr>
                  <td class="summary-column" width="272" style="width:272px; vertical-align:top;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="summary-box" style="border-collapse:separate; border-spacing:0; border:1px solid #243044; border-radius:14px; background:#101722;">
                      <tr>
                        <td class="summary-inner" height="58" style="padding:16px; height:58px; box-sizing:border-box;">
                          <p class="summary-label" style="margin:0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">Klant</p>
                          <p class="summary-value" style="margin:7px 0 0; color:#ffffff; font-size:17px; font-weight:700; word-break:break-word;">${companyName}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="summary-spacer" width="16" style="width:16px; min-width:16px; font-size:1px; line-height:1px;">&nbsp;</td>
                  <td class="summary-column" width="272" style="width:272px; vertical-align:top;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="summary-box summary-box-green" style="border-collapse:separate; border-spacing:0; border:1px solid #185b2d; border-radius:14px; background:#092414;">
                      <tr>
                        <td class="summary-inner" height="58" style="padding:16px; height:58px; box-sizing:border-box;">
                          <p class="summary-label" style="margin:0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;">Klantnummer</p>
                          <p class="summary-value summary-value-green" style="margin:7px 0 0; color:#22c55e; font-size:17px; font-weight:800;">${clientNumber}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p class="mobile-body-copy" style="margin:0 0 16px; color:#e5e7eb; font-size:16px; line-height:1.62;">
                ${S("aanhef", `Beste ${contactName},`)}
              </p>
              <p class="mobile-body-copy" style="margin:0 0 20px; color:#cbd5e1; font-size:16px; line-height:1.7;">
                ${introHtml}
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:28px 0;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" class="cta-link" style="display:inline-block; background:#008000; color:#ffffff; text-decoration:none; padding:15px 30px; border-radius:12px; font-size:15px; font-weight:800; box-shadow:0 12px 32px rgba(0,128,0,0.32);">
                      ${S("knoptekst", "Account activeren")}
                    </a>
                  </td>
                </tr>
              </table>

              <div class="steps-panel" style="padding:18px 18px 16px; border-radius:14px; border:1px solid #243044; background:#0f151c;">
                <p class="steps-title" style="margin:0 0 12px; color:#ffffff; font-size:14px; font-weight:800;">${S("stappen_titel", "Na activatie")}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td class="steps-copy" style="padding:8px 0; color:#cbd5e1; font-size:14px; line-height:1.5;">${S("stap1", "1. U kiest een wachtwoord en activeert het account.")}</td>
                  </tr>
                  <tr>
                    <td class="steps-copy" style="padding:8px 0; color:#cbd5e1; font-size:14px; line-height:1.5;">${S("stap2", "2. U vult contact-, factuur- en bankgegevens aan in het portaal.")}</td>
                  </tr>
                  <tr>
                    <td class="steps-copy" style="padding:8px 0; color:#cbd5e1; font-size:14px; line-height:1.5;">${step3Html}</td>
                  </tr>
                </table>
              </div>

              <p class="expiry-copy" style="margin:22px 0 0; color:#94a3b8; font-size:13px; line-height:1.55; text-align:center;">
                Deze uitnodiging vervalt over <strong class="expiry-strong" style="color:#e5e7eb;">${p.expiresInDays} dagen</strong>.<br>
                Link werkt niet? Kopieer deze URL in uw browser:<br>
                <a href="${inviteUrl}" style="color:#22c55e; word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="footer-cell" style="padding:24px 40px 30px; border-top:1px solid #1f2937; background:#080c10; text-align:center;">
              <p class="footer-copy" style="margin:0; color:#94a3b8; font-size:13px; line-height:1.6;">
                ${S("voettekst", 'Vragen? Mail naar <a href="mailto:info@e-charging.nl" style="color:#22c55e; text-decoration:none;">info@e-charging.nl</a>.')}
              </p>
              <p style="margin:14px 0 0; color:#64748b; font-size:12px;">
                Verzonden door ${fromName}. E-Charging is onderdeel van E-Group BV.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${T("aanhef", `Beste ${p.contactName},`)}

${introText}
Klantnummer: ${clientNumber}

Activeer uw account via deze link:
${p.inviteUrl}

${T("stappen_titel", "Na activatie")}:
${T("stap1", "1. U kiest een wachtwoord en activeert het account.")}
${T("stap2", "2. U vult contact-, factuur- en bankgegevens aan in het portaal.")}
${step3Text}

Deze uitnodiging vervalt over ${p.expiresInDays} dagen.

Vragen? Mail naar info@e-charging.nl.

${p.fromName}
E-Charging, onderdeel van E-Group BV
`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
