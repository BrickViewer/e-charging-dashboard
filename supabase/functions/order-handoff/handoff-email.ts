// E-Charging branded HTML-mail voor de e-portal handoff-notificatie. Gaat naar het
// (instelbare) E-Group-adres zodra een installatie-order is doorgestuurd naar de
// e-portal. Inline CSS voor brede client-ondersteuning, donkere brand-stijl met groen
// accent — spiegelt send-fault-notification/email-template.ts. HTML-attributen met
// enkele quotes (robuuste deploy). Bewust GEEN klikbare deeplink: de e-portal heeft
// (nog) geen order-URL, dus we tonen het OPD-ordernummer waarmee de opdracht opzoekbaar is.

export interface HandoffEmailParams {
  orderNumber: string | null;   // egroup_order_number (OPD-…)
  clientName: string;           // bedrijf of particulier
  siteAddress: string;          // uitvoeradres: straat + nr, postcode + plaats
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  serviceLabel: string;         // service_category (+ service_summary)
  notes: string | null;
  logoUrl: string;
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderHandoffEmail(p: HandoffEmailParams): { subject: string; html: string; text: string } {
  const orderRef = p.orderNumber && p.orderNumber.trim() ? p.orderNumber.trim() : null;
  const subject = `Nieuwe opdracht in de e-portal — ${p.clientName}${orderRef ? ` (${orderRef})` : ''}`;

  const contactValue = [p.contactName, p.contactPhone, p.contactEmail]
    .map((v) => (v && v.trim() ? v.trim() : ''))
    .filter(Boolean)
    .join(' · ');

  const row = (label: string, value: string) => value
    ? `<tr>
        <td style='padding:6px 0;font-size:12px;color:#73818b;vertical-align:top;white-space:nowrap;width:132px;'>${escapeHtml(label)}</td>
        <td style='padding:6px 0;font-size:13px;color:#ffffff;vertical-align:top;'>${escapeHtml(value)}</td>
      </tr>`
    : '';

  const detailRows = [
    row('Klant', p.clientName),
    row('Uitvoeradres', p.siteAddress),
    row('Contactpersoon', contactValue),
    row('Dienst', p.serviceLabel),
    row('Notities', p.notes && p.notes.trim() ? p.notes.trim() : ''),
  ].join('');

  const orderPill = orderRef
    ? `<div style='margin:0 0 14px 0;'>
        <span style='display:inline-block;background:#0e2a12;color:#7ee08a;font-size:13px;font-weight:700;letter-spacing:0.02em;padding:5px 14px;border-radius:999px;border:1px solid #1c4322;'>Ordernummer ${escapeHtml(orderRef)}</span>
      </div>`
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
          <div style='display:inline-block;background:#0e2a12;color:#7ee08a;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 12px;border-radius:999px;'>Nieuwe opdracht</div>
          <h1 style='font-size:20px;line-height:1.3;color:#ffffff;margin:14px 0 6px 0;'>Er staat een nieuwe opdracht klaar in de e-portal</h1>
          <p style='font-size:14px;color:#9aa7b0;margin:0 0 18px 0;line-height:1.6;'>E-Charging heeft zojuist een installatie-opdracht doorgestuurd naar de e-portal. De opdracht staat klaar om ingepland en uitgevoerd te worden.</p>
        </td></tr>
        <tr><td style='padding:0 24px 8px 24px;'>
          <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='background:#0b0f13;border:1px solid #1c252b;border-radius:12px;'>
            <tr><td style='padding:16px 18px;'>
              ${orderPill}
              <table role='presentation' width='100%' cellpadding='0' cellspacing='0'>${detailRows}</table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style='padding:6px 24px 26px 24px;'>
          <p style='font-size:13px;color:#9aa7b0;margin:0 0 4px 0;line-height:1.6;'>Open de e-portal om de opdracht in te plannen${orderRef ? ` (zoek op <strong style='color:#ffffff;'>${escapeHtml(orderRef)}</strong>)` : ''}.</p>
          <p style='font-size:12px;color:#5e6a73;margin:14px 0 0 0;'>Deze melding is automatisch verstuurd door het E-Charging dashboard.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    subject,
    '',
    orderRef ? `Ordernummer: ${orderRef}` : '',
    `Klant: ${p.clientName}`,
    p.siteAddress ? `Uitvoeradres: ${p.siteAddress}` : '',
    contactValue ? `Contactpersoon: ${contactValue}` : '',
    p.serviceLabel ? `Dienst: ${p.serviceLabel}` : '',
    p.notes && p.notes.trim() ? `Notities: ${p.notes.trim()}` : '',
    '',
    `De opdracht staat klaar in de e-portal om ingepland te worden${orderRef ? ` (zoek op ${orderRef})` : ''}.`,
  ].filter((l) => l !== '').join('\n');

  return { subject, html, text };
}
