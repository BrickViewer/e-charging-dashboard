import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/logo-full-color.svg";
import { OUTFIT_REGULAR_BASE64, OUTFIT_SEMIBOLD_BASE64 } from "@/assets/fonts/outfit";
import { buildOfferPages, PAGE_W, PAGE_H, type OfferTemplateData, type OfferTemplateSignature } from "./offerTemplate";

// ---------------------------------------------------------------------------
// Offerte-PDF — 1:1 op het e-charging offerte-ontwerp.
// Aanpak: een HTML/CSS-sjabloon (offerTemplate.ts) per A4-pagina, off-screen
// gerenderd met html2canvas en gebundeld tot een PDF met jsPDF. Eén client-side
// generator, gebruikt voor (a) de preview/verzending in het sales-werkblad en
// (b) de getekende versie op de publieke akkoord-pagina (met handtekening).
//
// De cover-achtergrondfoto wordt geladen uit /offer-cover.jpg (apps/admin/public).
// Ontbreekt die, dan valt de cover terug op het groene ontwerp zonder foto.
// ---------------------------------------------------------------------------

export type OfferPdfData = OfferTemplateData;

export interface OfferSignature {
  signerName?: string; // klant-naam (rechts); leeg bij interne/preview-render
  signatureDataUrl?: string; // PNG data-URL van het klant-handtekening-canvas
  date?: string | null; // ISO; default vandaag
  // E-Charging mede-ondertekening (links).
  echargingSignatureDataUrl?: string | null;
  echargingSignerName?: string | null;
  echargingSignerFunction?: string | null;
}

const COVER_URL = "/offer-cover.jpg";

// Outfit als webfont registreren (zodat html2canvas de tekst in Outfit rendert).
let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    try {
      const reg = new FontFace("Outfit", `url(data:font/ttf;base64,${OUTFIT_REGULAR_BASE64})`, { weight: "400", style: "normal" });
      const semi = new FontFace("Outfit", `url(data:font/ttf;base64,${OUTFIT_SEMIBOLD_BASE64})`, { weight: "600", style: "normal" });
      await Promise.all([reg.load(), semi.load()]);
      document.fonts.add(reg);
      document.fonts.add(semi);
    } catch {
      /* val terug op Arial/sans-serif */
    }
  })();
  return fontsReady;
}

// SVG-logo → JPEG data-URL (witte achtergrond), met behoud van verhouding.
async function rasterizeLogo(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    let svg = await res.text();
    let w = 2000, h = 800;
    const vb = svg.match(/viewBox="([\d.\s-]+)"/);
    if (vb) {
      const parts = vb[1].trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) { w = parts[2]; h = parts[3]; }
    }
    svg = svg.replace(/<svg([^>]*)>/, (_m, a: string) =>
      `<svg${a.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "")} width="${w}" height="${h}">`);
    const objUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(objUrl);
      const tw = 600, th = Math.round((tw * h) / w);
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      return c.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("img"));
    i.src = src;
  });
}

// Probeer de cover-foto te laden; geef de URL terug of null als die ontbreekt.
async function preloadCover(url: string): Promise<string | null> {
  try {
    await loadImage(url);
    return url;
  } catch {
    return null;
  }
}

export async function awaitNodeImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }),
    ),
  );
}

// Logo-raster + cover één keer laden + cachen — de live preview hergebruikt dit (geen refetch per toetsaanslag).
let assetsReady: Promise<{ logoUrl: string | null; coverUrl: string | null }> | null = null;
function ensureAssets(): Promise<{ logoUrl: string | null; coverUrl: string | null }> {
  if (assetsReady) return assetsReady;
  assetsReady = (async () => {
    const [logoDataUrl, coverUrl] = await Promise.all([rasterizeLogo(logoUrl), preloadCover(COVER_URL)]);
    return { logoUrl: logoDataUrl, coverUrl };
  })();
  return assetsReady;
}

function toTemplateSignature(signature?: OfferSignature): OfferTemplateSignature | undefined {
  if (!signature) return undefined;
  return {
    signerName: signature.signerName,
    signatureDataUrl: signature.signatureDataUrl,
    date: signature.signatureDataUrl ? (signature.date ?? new Date().toISOString()) : (signature.date ?? null),
    echargingSignatureDataUrl: signature.echargingSignatureDataUrl ?? null,
    echargingSignerName: signature.echargingSignerName ?? null,
    echargingSignerFunction: signature.echargingSignerFunction ?? null,
  };
}

// Bouwt de A4-pagina-nodes (cover + brief): exact de DOM die naar de PDF wordt gerasterd.
// Hergebruikt door de PDF-generator én de live on-screen preview (OfferPreview).
// LET OP: roep awaitNodeImages(node) pas aan NÁ het mounten in de DOM.
export async function renderOfferPages(data: OfferPdfData, signature?: OfferSignature): Promise<HTMLElement[]> {
  await ensureFonts();
  const assets = await ensureAssets();
  return buildOfferPages(data, assets, toTemplateSignature(signature));
}

export async function generateOfferPdf(data: OfferPdfData, signature?: OfferSignature): Promise<jsPDF> {
  const pages = await renderOfferPages(data, signature);

  // Off-screen host zodat layout + fonts resolven (niet display:none).
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1;background:#ffffff";
  pages.forEach((p) => host.appendChild(p));
  document.body.appendChild(host);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  try {
    await Promise.all(pages.map(awaitNodeImages));
    if (document.fonts?.ready) await document.fonts.ready;

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: PAGE_W,
        height: PAGE_H,
        windowWidth: PAGE_W,
        windowHeight: PAGE_H,
        logging: false,
      });
      const img = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) doc.addPage();
      doc.addImage(img, "JPEG", 0, 0, 210, 297);
    }
  } finally {
    document.body.removeChild(host);
  }

  return doc;
}

// Hulpfuncties voor de twee gebruikers (sales-preview/verzending + publieke akkoord-pagina).
export async function offerPdfBlob(data: OfferPdfData, signature?: OfferSignature): Promise<Blob> {
  return (await generateOfferPdf(data, signature)).output("blob");
}
// Base64 (zonder data-URL-prefix), voor verzending naar de edge function.
export async function offerPdfBase64(data: OfferPdfData, signature?: OfferSignature): Promise<string> {
  const uri = (await generateOfferPdf(data, signature)).output("datauristring");
  return uri.split(",")[1] ?? "";
}
