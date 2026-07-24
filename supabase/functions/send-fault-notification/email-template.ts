// E-Charging branded HTML-mail voor storingsmeldingen. Inline CSS voor brede
// ondersteuning in e-mailclients. Donkere brand-stijl, groen accent.
// HTML-attributen met enkele quotes (robuuste deploy, functioneel identiek).

export interface FaultEmailItem {
  faultId: string;
  clientName: string;
  clientNumber: string;
  locationName: string;
  locationAddress: string;
  chargePointName: string;
  identifiers: string;
  reason: string;
  contactName: string;
  contactPhone: string;
  detailUrl: string;
}

export interface FaultEmailParams {
  items: FaultEmailItem[];
  locationName: string;
  overviewUrl: string;
  logoUrl: string;
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** `slots`/`slotsText` uit email_templates (sleutel "storing-gedetecteerd"), placeholders al
 *  ingevuld. Niet meegegeven → de standaardteksten hieronder. */
export function renderFaultEmail(
  p: FaultEmailParams,
  slots?: Record<string, string>,
  slotsText?: Record<string, string>,
): { subject: string; html: string; text: string } {
  const count = p.items.length;
  const multi = count > 1;
  const S = (n: string, d: string) => slots?.[n] ?? d;
  const T = (n: string, d: string) => slotsText?.[n] ?? slots?.[n] ?? d;
  const subject = multi
    ? T("onderwerp_bundel", `Storing: ${count} laadpunten op ${p.locationName}`)
    : T("onderwerp_enkel", `Storing gedetecteerd: ${p.items[0]?.chargePointName ?? 'laadpunt'}`);

  const itemBlocks = p.items.map((it) => `
    <table role='presentation' width='100%' cellpadding='0' cellspacing='0' style='margin:0 0 14px 0;background:#0b0f13;border:1px solid #1c252b;border-radius:12px;'>
      <tr><td style='padding:16px 18px;'>
        <div style='font-size:15px;font-weight:700;color:#ffffff;'>${escapeHtml(it.chargePointName)}</div>
        <div style='font-size:13px;color:#9aa7b0;margin-top:2px;'>${escapeHtml(it.clientName)} ${escapeHtml(it.clientNumber)} &middot; ${escapeHtml(it.locationName)}</div>
        <div style='font-size:13px;color:#9aa7b0;margin-top:8px;'>${escapeHtml(it.locationAddress)}</div>
        <div style='margin-top:10px;'>
          <span style='display:inline-block;background:#3a1418;color:#ff8a8a;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;'>${escapeHtml(it.reason)}</span>
        </div>
        <div style='font-size:12px;color:#73818b;margin-top:10px;line-height:1.6;'>
          <strong style='color:#9aa7b0;'>Paal-IDs:</strong> ${escapeHtml(it.identifiers)}<br>
          <strong style='color:#9aa7b0;'>Contact:</strong> ${escapeHtml(it.contactName)}${it.contactPhone ? ' &middot; ' + escapeHtml(it.contactPhone) : ''}
        </div>
        <a href='${escapeHtml(it.detailUrl)}' style='display:inline-block;margin-top:14px;background:#05A500;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;'>${S("knoptekst_storing", "Open storing")}</a>
      </td></tr>
    </table>`).join('');

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
          <div style='display:inline-block;background:#3a1418;color:#ff8a8a;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:4px 12px;border-radius:999px;'>${S("label", "Storing gedetecteerd")}</div>
          <h1 style='font-size:20px;line-height:1.3;color:#ffffff;margin:14px 0 6px 0;'>${multi ? S("kop_bundel", escapeHtml(`${count} laadpunten op ${p.locationName} hebben een storing`)) : S("kop_enkel", 'Een laadpunt heeft een storing')}</h1>
          <p style='font-size:14px;color:#9aa7b0;margin:0 0 18px 0;line-height:1.6;'>${S("intro", "Onze monitoring detecteerde dit automatisch. Acteer hierop voordat de klant het merkt: bel e-Flux, en neem zo nodig contact op met de locatie.")}</p>
        </td></tr>
        <tr><td style='padding:0 24px 8px 24px;'>${itemBlocks}</td></tr>
        <tr><td style='padding:6px 24px 26px 24px;'>
          <a href='${escapeHtml(p.overviewUrl)}' style='display:inline-block;background:#11181d;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;border:1px solid #2a363d;'>${S("knoptekst_overzicht", "Open het storingenoverzicht")}</a>
          <p style='font-size:12px;color:#5e6a73;margin:18px 0 0 0;'>${S("voettekst", "Deze melding is automatisch verstuurd door het E-Charging dashboard.")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    subject,
    '',
    ...p.items.map((it) =>
      `- ${it.chargePointName} (${it.clientName} ${it.clientNumber}, ${it.locationName})\n  ${it.reason} | ${it.identifiers}\n  Contact: ${it.contactName} ${it.contactPhone}\n  ${it.detailUrl}`),
    '',
    `Overzicht: ${p.overviewUrl}`,
  ].join('\n');

  return { subject, html, text };
}
