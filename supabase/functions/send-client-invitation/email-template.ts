// E-Charging branded HTML email template voor klant-uitnodiging.
// Inline styling — moderne email-clients ondersteunen weinig CSS.
// Primary brand-green: #008000. Outfit font wordt nooit gerenderd in Mail.app/Outlook,
// maar fallback naar -apple-system / Helvetica is prima.

interface InviteEmailParams {
  companyName: string;
  contactName: string;
  inviteUrl: string;
  expiresInDays: number;
  fromName: string;
}

export function renderInviteEmail(p: InviteEmailParams): { subject: string; html: string; text: string } {
  const subject = `Welkom bij E-Charging — uw klantportaal staat klaar`;

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #18181b;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">

          <!-- Hero -->
          <tr>
            <td style="background: linear-gradient(135deg, #008000 0%, #00a000 100%); padding: 48px 40px; text-align: center;">
              <div style="display: inline-block; background-color: rgba(255,255,255,0.15); padding: 14px 22px; border-radius: 12px; backdrop-filter: blur(10px);">
                <span style="color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.02em;">⚡ E-Charging</span>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 600; margin: 32px 0 8px; letter-spacing: -0.01em;">
                Welkom bij uw klantportaal
              </h1>
              <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0; line-height: 1.5;">
                Inzicht in uw laadpunten, sessies en opbrengsten — 24/7
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px; color: #18181b;">
                Beste ${escapeHtml(p.contactName)},
              </p>
              <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #3f3f46;">
                Voor <strong style="color: #18181b;">${escapeHtml(p.companyName)}</strong> hebben we het klantportaal ingericht. Hier ziet u live wat uw laadpunten doen, hoeveel kWh er wordt geleverd, en welke opbrengst u toekomt — per locatie en per kwartaal.
              </p>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${p.inviteUrl}"
                       style="display: inline-block; background-color: #008000; color: #ffffff; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: 0.01em; box-shadow: 0 4px 12px rgba(0,128,0,0.25);">
                      Account activeren →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; line-height: 1.5; color: #71717a; margin: 24px 0 0; text-align: center;">
                Of kopieer deze link in uw browser:<br>
                <a href="${p.inviteUrl}" style="color: #008000; word-break: break-all;">${p.inviteUrl}</a>
              </p>

              <!-- Wat u kunt zien -->
              <div style="margin-top: 40px; padding-top: 32px; border-top: 1px solid #e4e4e7;">
                <h2 style="font-size: 16px; font-weight: 600; color: #18181b; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Wat ziet u in het portaal?
                </h2>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #f4f4f5;">
                      <strong style="color: #18181b; font-size: 15px;">📊 Live laadsessies</strong>
                      <p style="margin: 4px 0 0; color: #52525b; font-size: 14px;">Real-time overzicht per laadpunt — wie laadt, hoeveel kWh, wat dat oplevert.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #f4f4f5;">
                      <strong style="color: #18181b; font-size: 15px;">💰 Kwartaalafrekening</strong>
                      <p style="margin: 4px 0 0; color: #52525b; font-size: 14px;">Transparante breakdown van uw opbrengst per kwartaal — uitbetaling automatisch via SEPA.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #f4f4f5;">
                      <strong style="color: #18181b; font-size: 15px;">⚡ ERE-indicatie</strong>
                      <p style="margin: 4px 0 0; color: #52525b; font-size: 14px;">Geschat ERE-bedrag dat u via Laadbeloning ontvangt — separaat zichtbaar.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0;">
                      <strong style="color: #18181b; font-size: 15px;">📍 Locatie-detail</strong>
                      <p style="margin: 4px 0 0; color: #52525b; font-size: 14px;">Per pand: alle laadpunten, status en sessie-historie.</p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Vervaldatum -->
              <div style="margin-top: 32px; padding: 16px 20px; background-color: #fef3c7; border-radius: 8px; border-left: 3px solid #f59e0b;">
                <p style="margin: 0; font-size: 14px; color: #78350f;">
                  ⏱ Deze uitnodiging vervalt over <strong>${p.expiresInDays} dagen</strong>. Daarna stuurt onze beheerder een nieuwe uitnodiging.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 32px 40px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="font-size: 13px; color: #71717a; margin: 0 0 8px;">
                Vragen? Antwoord direct op deze mail of neem contact op via
                <a href="mailto:info@e-charging.nl" style="color: #008000; text-decoration: none;">info@e-charging.nl</a>.
              </p>
              <p style="font-size: 12px; color: #a1a1aa; margin: 16px 0 0;">
                Verzonden door ${escapeHtml(p.fromName)} · E-Charging is onderdeel van E-Group BV
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Beste ${p.contactName},

Voor ${p.companyName} hebben we het klantportaal van E-Charging ingericht. Hier ziet u live wat uw laadpunten doen, hoeveel kWh er wordt geleverd, en welke opbrengst u toekomt.

Activeer uw account via deze link:
${p.inviteUrl}

Deze uitnodiging vervalt over ${p.expiresInDays} dagen.

Wat u kunt zien in het portaal:
• Live laadsessies — real-time overzicht per laadpunt
• Kwartaalafrekening — transparante breakdown + automatische SEPA uitbetaling
• ERE-indicatie — geschat bedrag via Laadbeloning
• Locatie-detail — per pand al uw laadpunten

Vragen? Antwoord direct op deze mail of contact via info@e-charging.nl.

— ${p.fromName}
E-Charging · onderdeel van E-Group BV
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
