// Genereert een blog-omslag (1200x630) als PNG. Twee varianten:
//  - FOTO-composiet: Imagen-foto (via buildBlogCover) als volvlak <image> + donkere scrim-gradient + de kop
//    onderin (thumbnail-stijl, sterk voor og:image/CTR).
//  - Vlakke merk-kaart: fallback zonder foto/sleutel (huisstijl + kop gecentreerd).
// resvg-wasm + Outfit-TTF worden bij cold start uit een CDN gehaald en module-gecachet. resvg embed de foto
// via een data:-URI (geen netwerk-fetch in resvg zelf). buildBlogCover doet de I/O + valt terug bij elke fout.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { initWasm, Resvg } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";
import { getAnthropicKey } from "./anthropic.ts";
import { getGeminiKey, coverBrief, generateImagenPhoto } from "./imagegen.ts";

const WASM_URL = "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
// Outfit (variabel gewicht) als ruwe TTF uit de Google Fonts-repo via jsDelivr; resvg heeft TTF/OTF nodig (geen woff2).
const FONT_URL = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/outfit/Outfit%5Bwght%5D.ttf";

let wasmReady: Promise<unknown> | null = null;
let fontBytes: Uint8Array | null = null;

async function ensureReady(): Promise<Uint8Array> {
  if (!wasmReady) wasmReady = initWasm(fetch(WASM_URL));
  await wasmReady;
  if (!fontBytes) {
    const res = await fetch(FONT_URL);
    if (!res.ok) throw new Error(`Font-fetch mislukt: HTTP ${res.status}`);
    fontBytes = new Uint8Array(await res.arrayBuffer());
  }
  return fontBytes;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Woord-wrap op een karakter-budget tot maximaal maxLines regels (rest valt weg; koppen zijn kort).
function wrapTitle(title: string, maxChars: number, maxLines: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxChars || !cur) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) { cur = ""; break; }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [title.slice(0, maxChars)];
}

// bytes = de composiet-omslag (foto + kop, voor og:image/thumbnail); heroBytes = de RAUWE foto zonder tekst
// (voor de artikel-hero met echte tekst eroverheen). alt is de beschrijvende alt-tekst voor beide.
export interface Cover { bytes: Uint8Array; width: number; height: number; alt: string; heroBytes?: Uint8Array; heroMime?: string; }

// Base64 (chunked, tegen call-stack-overflow bij grote foto's).
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const GREEN = "#05A500"; // e-charging logo-groen

// Het echte e-charging-logo (wit), als brand-asset op onze eigen site. We halen het SVG eenmalig op (module-gecachet,
// net als wasm/font) en tekenen de paden NATIVE via resvg (geen <image>/rasterisatie). Faalt de fetch, dan valt de
// omslag netjes terug zonder logo (de kop blijft staan).
const LOGO_URL = "https://www.e-charging.nl/brand/echarging-logo-white.svg";
let logoInner: string | null = null;

async function ensureLogo(): Promise<string | null> {
  if (logoInner) return logoInner;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = await res.text();
    const open = svg.indexOf(">", svg.indexOf("<svg"));
    const close = svg.lastIndexOf("</svg>");
    if (open < 0 || close < 0 || close <= open) throw new Error("logo-SVG onleesbaar");
    // Strip editor-only namespaced attributen (bv. serif:id van Affinity/Serif): resvg/roxmltree kent die
    // namespace-prefix niet (niet gedeclareerd in ons fragment) en breekt anders de SVG-parse af.
    logoInner = svg.slice(open + 1, close).trim().replace(/\s+serif:[\w-]+="[^"]*"/g, "");
    return logoInner;
  } catch (e) {
    console.error("Logo-fetch mislukt, omslag zonder logo:", e instanceof Error ? e.message : e);
    return null; // niet cachen: probeer het bij de volgende render opnieuw
  }
}

// Plaatst het logo linksboven (geschaald uit de 2000x400-viewBox naar ~46px hoog); de root-stijl (fill-rule/stroke-*)
// staat op de <g> zodat de plug-stroke en swoosh kloppen. Leeg als er geen logo beschikbaar is.
function logoGroup(inner: string | null): string {
  if (!inner) return "";
  return `<g transform="translate(80,52) scale(0.115)" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5;">${inner}</g>`;
}

// Rendert de PNG. Met photoDataUri -> foto-composiet, anders de vlakke kaart. Puur (alleen wasm/font-fetch).
async function renderCoverPng(opts: { title: string; category?: string | null; photoDataUri?: string }): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const font = await ensureReady();
  const logoG = logoGroup(await ensureLogo());
  const title = (opts.title || "").trim() || "Kennisbank";
  const eyebrow = (opts.category && opts.category.trim() ? opts.category.trim() : "KENNISBANK").toUpperCase();
  const W = 1200, H = 630;
  const lines = wrapTitle(title, 30, 4);

  let svg: string;
  if (opts.photoDataUri) {
    // Foto-composiet: foto vult het vlak, donkere scrim voor leesbaarheid, kop onderin.
    const fontSize = lines.length >= 4 ? 44 : lines.length === 3 ? 50 : 58;
    const lineH = fontSize + 12;
    const bottom = 566;
    const firstY = bottom - (lines.length - 1) * lineH;
    const ruleY = Math.round(firstY - fontSize - 20);
    const tspans = lines.map((l, i) => `<tspan x="80" y="${Math.round(firstY + i * lineH)}">${esc(l)}</tspan>`).join("");
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#06100B" stop-opacity="0.72"/>
      <stop offset="0.30" stop-color="#06100B" stop-opacity="0.12"/>
      <stop offset="0.58" stop-color="#06100B" stop-opacity="0.36"/>
      <stop offset="1" stop-color="#06100B" stop-opacity="0.93"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#06100B"/>
  <image x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" href="${opts.photoDataUri}"/>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${GREEN}"/>
  ${logoG}
  <text x="${W - 80}" y="86" text-anchor="end" font-family="Outfit" font-weight="600" font-size="22" letter-spacing="4" fill="#FFFFFF">${esc(eyebrow)}</text>
  <rect x="80" y="${ruleY}" width="90" height="6" rx="3" fill="${GREEN}"/>
  <text font-family="Outfit" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.9">${tspans}</text>
</svg>`;
  } else {
    // Vlakke merk-kaart (fallback zonder foto).
    const fontSize = lines.length >= 4 ? 52 : lines.length === 3 ? 60 : 66;
    const lineH = fontSize + 14;
    const midY = 330;
    const startY = midY - ((lines.length - 1) * lineH) / 2;
    const tspans = lines.map((l, i) => `<tspan x="80" y="${Math.round(startY + i * lineH)}">${esc(l)}</tspan>`).join("");
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0C1A12"/>
      <stop offset="1" stop-color="#07110C"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="14" height="${H}" fill="${GREEN}"/>
  ${logoG}
  <text x="${W - 80}" y="86" text-anchor="end" font-family="Outfit" font-weight="600" font-size="22" letter-spacing="4" fill="${GREEN}">${esc(eyebrow)}</text>
  <text font-family="Outfit" font-weight="700" font-size="${fontSize}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.8">${tspans}</text>
  <rect x="80" y="520" width="96" height="6" rx="3" fill="${GREEN}"/>
  <text x="80" y="566" font-family="Outfit" font-weight="400" font-size="25" fill="#A9C7B9">Laadinfrastructuur voor bedrijven en vastgoed</text>
</svg>`;
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontBuffers: [font], loadSystemFonts: false, defaultFontFamily: "Outfit" },
  });
  return { bytes: resvg.render().asPng(), width: W, height: H };
}

// Render de composiet met een MEEGEGEVEN foto (handmatig/test): base64 de bytes en teken de kop erover.
export async function renderCoverWithPhoto(opts: { title: string; category?: string | null; photoBytes: Uint8Array; mime?: string }): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const dataUri = `data:${opts.mime ?? "image/jpeg"};base64,${bytesToB64(opts.photoBytes)}`;
  return await renderCoverPng({ title: opts.title, category: opts.category, photoDataUri: dataUri });
}

// Orchestrator: probeer een Imagen-foto (Claude-brief + Imagen), compositeer met de kop; val bij ELKE fout
// (geen sleutel, API-fout, policy-block) terug op de vlakke kaart. Retourneert ook de beschrijvende alt-tekst.
export async function buildBlogCover(
  sb: any,
  opts: { title: string; category?: string | null; keyword?: string | null },
): Promise<Cover> {
  let photoDataUri: string | undefined;
  let heroBytes: Uint8Array | undefined;
  let heroMime: string | undefined;
  let alt = opts.title;
  try {
    const [anthropicKey, geminiKey] = await Promise.all([getAnthropicKey(sb), getGeminiKey(sb)]);
    if (anthropicKey && geminiKey) {
      const brief = await coverBrief(anthropicKey, opts);
      const photo = await generateImagenPhoto(geminiKey, brief.image_prompt);
      photoDataUri = `data:${photo.mime};base64,${photo.b64}`;
      heroBytes = b64ToBytes(photo.b64); // de rauwe foto zonder tekst, voor de artikel-hero
      heroMime = photo.mime;
      alt = brief.alt;
    }
  } catch (e) {
    console.error("Foto-brief/Imagen mislukt, terugval op vlakke kaart:", e instanceof Error ? e.message : e);
    photoDataUri = undefined; heroBytes = undefined; heroMime = undefined;
  }
  try {
    const r = await renderCoverPng({ title: opts.title, category: opts.category, photoDataUri });
    return { bytes: r.bytes, width: r.width, height: r.height, alt, heroBytes, heroMime };
  } catch (e) {
    // Composiet-render mislukt (bv. resvg-image): vlakke kaart als omslag, maar de rauwe hero-foto blijft geldig.
    if (photoDataUri) {
      console.error("Composiet-render mislukt, vlakke kaart:", e instanceof Error ? e.message : e);
      const r = await renderCoverPng({ title: opts.title, category: opts.category });
      return { bytes: r.bytes, width: r.width, height: r.height, alt, heroBytes, heroMime };
    }
    throw e;
  }
}
