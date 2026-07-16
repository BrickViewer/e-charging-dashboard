// E-Charging branded HTML-mail voor een portaalbericht van de staf aan een klant. Donkere
// brand-stijl met groen accent, inline CSS, HTML-attributen met enkele quotes (robuuste deploy) —
// spiegelt order-handoff/handoff-email.ts. Onderwerp + bericht komen 1-op-1 uit de composer;
// regeleindes in het bericht blijven behouden. Optionele CTA naar het klantportaal (alleen bij
// een klant met portaalaccount).

export interface ClientMessageEmailParams {
  companyName: string;
  contactName: string | null;
  subject: string;
  message: string;
  portalUrl: string | null; // link naar /portal/berichten; null = geen portaalaccount → geen CTA
  logoUrl: string;
  fromName: string;
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderClientMessageEmail(p: ClientMessageEmailParams): { subject: string; html: string; text: string } {
  const subject = p.subject.trim();
  const greetingName = p.contactName && p.contactName.trim()
    ? p.contactName.trim()
    : (p.companyName && p.companyName.trim() ? p.companyName.trim() : 'daar');
  // Bericht veilig weergeven met behoud van regeleindes.
  const bodyHtml = escapeHtml(p.message.trim()).replace(/\r?\n/g, '<br>');

  const cta = p.portalUrl
    ? `<tr><td style='padding:8px 24px 4px 24px;'>
          <a href='${escapeHtml(p.portalUrl)}' style='display:inline-block;background:#22c55e;color:#04120a;font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:10px;'>Bekijk in je portaal</a>
        </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang='nl'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>${escapeHtml(subject)}</title></head>
<body style='margin:0;padding:0;background:#05080a;'>
  <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#05080a;'>
    <tr><td align='center' style='padding:28px 16px;'>
      <table role='presentation' width='560' cellpadding='0' cellspacing='0' style='width:560px;max-width:100%;background:#0b0f13;border:1px solid #1c252b;border-radius:18px;overflow:hidden;'>
        <tr><td style='padding:24px 24px 8px 24px;'>
          <img src='${escapeHtml(p.logoUrl)}' alt='E-Charging' height='28' style='height:28px;width:auto;display:block;'>
        </td></tr>
        <tr><td style='padding:8px 24px 0 24px;'>
          <div style='display:inline-block;background:#0e2a12;color:#7ee08a;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 12px;border-radius:999px;'>Bericht</div>
          <h1 style='font-size:20px;line-height:1.3;color:#ffffff;margin:14px 0 6px 0;'>${escapeHtml(subject)}</h1>
          <p style='font-size:14px;color:#9aa7b0;margin:0 0 14px 0;line-height:1.6;'>Beste ${escapeHtml(greetingName)},</p>
        </td></tr>
        <tr><td style='padding:0 24px 8px 24px;'>
          <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#0b0f13;border:1px solid #1c252b;border-radius:12px;'>
            <tr><td style='padding:16px 18px;font-size:14px;color:#e6edf2;line-height:1.7;'>${bodyHtml}</td></tr>
          </table>
        </td></tr>
        ${cta}
        <tr><td style='padding:14px 24px 26px 24px;'>
          <p style='font-size:13px;color:#9aa7b0;margin:0;line-height:1.6;'>Met vriendelijke groet,<br><strong style='color:#ffffff;'>${escapeHtml(p.fromName)}</strong></p>
          <p style='font-size:12px;color:#5e6a73;margin:14px 0 0 0;'>Je kunt op deze e-mail reageren; je bericht komt dan bij ons team binnen.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const textLines: string[] = [subject, '', `Beste ${greetingName},`, '', p.message.trim(), ''];
  if (p.portalUrl) {
    textLines.push(`Bekijk in je portaal: ${p.portalUrl}`, '');
  }
  textLines.push('Met vriendelijke groet,', p.fromName, '', 'Je kunt op deze e-mail reageren; je bericht komt dan bij ons team binnen.');
  const text = textLines.join('\n');

  return { subject, html, text };
}
