// Conversie tussen de opslagvorm van het offerte-e-mailbericht (platte tekst met markdown-vet
// `**woord**`, lege regel = nieuwe alinea) en HTML voor de WYSIWYG-editor / read-only weergave.
// Bewust minimaal: alléén vet + alinea's + regelafbrekingen — zo blijft de opslag platte tekst en
// blijft de e-mail-render (offer-email.ts) triviaal veilig (escapen, dan pas `**…**` → <strong>).

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// `**vet**`-platte tekst → veilige HTML (<p>/<br>/<strong>). Voor TipTap-content en de weergave op de
// interne-ondertekenpagina. Escape-first, dus veilig voor dangerouslySetInnerHTML.
export function mdBoldToHtml(md: string): string {
  return (md || "")
    .split(/\n\s*\n/)
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const html = escapeText(par)
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<p>${html}</p>`;
    })
    .join("");
}

// TipTap `getHTML()` → opslagvorm (platte tekst met `**vet**`). Mapt alleen onze toegestane opmaak en
// stript de rest; decodeert HTML-entities via een tijdelijke textarea (client-side).
export function htmlToMdBold(html: string): string {
  let s = html || "";
  s = s.replace(/<\/?(strong|b)\b[^>]*>/gi, "**"); // vet → **
  s = s.replace(/<br\s*\/?>/gi, "\n"); // regelafbreking
  s = s.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n"); // alineagrens
  s = s.replace(/<\/?p[^>]*>/gi, ""); // resterende p-tags
  s = s.replace(/<[^>]+>/g, ""); // overige tags strippen
  if (typeof document !== "undefined") {
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    s = ta.value;
  }
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
