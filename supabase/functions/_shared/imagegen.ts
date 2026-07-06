// Beeldgeneratie voor blog-omslagen: Claude bedenkt een beeld-brief (fotorealistische scene-prompt + een
// zoekwoord-rijke NL alt-tekst) uit het onderwerp, en Google Imagen (Gemini API) maakt de foto. Puur I/O;
// de aanroeper (buildBlogCover in cover.ts) compositeert de foto met de kop-overlay. Zonder sleutel of bij
// een API-fout gooit dit, en valt de aanroeper terug op de vlakke merk-kaart.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveSecret } from "./secrets.ts";
import { anthropicMessage, extractJson, DEFAULT_MODEL } from "./anthropic.ts";

// Google Gemini/Imagen-sleutel uit edge-env of Vault. Alleen op naam; nooit loggen.
export async function getGeminiKey(sb: any): Promise<string | null> {
  return await resolveSecret(sb, ["GEMINI_API_KEY", "GOOGLE_API_KEY"], "gemini_api_key");
}

const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";

const BRIEF_SYSTEM = `Je bedenkt het beeld voor de omslag van een blog van een Nederlands B2B-bedrijf in laadinfrastructuur voor elektrisch vervoer (doelgroep: vastgoedeigenaren, VvE-besturen, bedrijven en installateurs).

Antwoord UITSLUITEND met geldige JSON, exact dit schema, zonder extra tekst:
{"image_prompt": string, "alt": string}

- image_prompt: een korte, concrete Engelstalige beschrijving voor een tekst-naar-beeld-model van EEN fotorealistische, professionele scene die past bij het onderwerp. Nederlandse of Europese context, laadinfrastructuur of vastgoed waar relevant, natuurlijk daglicht, realistisch en modern. BELANGRIJK: geen tekst, letters, cijfers, woorden, kentekens of logo's in beeld; geen collage; een helder enkel onderwerp; landschapsformaat; hoge kwaliteit.
- alt: een korte, feitelijke Nederlandse alt-tekst (zoekwoord-rijk) die beschrijft wat er op de foto te zien is, voor toegankelijkheid en image-SEO. Verzin geen merknaam.`;

// Vraagt Claude om een beeld-brief. Gooit bij een lege/ongeldige respons (aanroeper vangt af).
export async function coverBrief(
  anthropicKey: string,
  opts: { title: string; category?: string | null; keyword?: string | null },
): Promise<{ image_prompt: string; alt: string }> {
  const user = [
    `ONDERWERP: ${opts.title}`,
    opts.keyword ? `ZOEKWOORD: ${opts.keyword}` : null,
    opts.category ? `CATEGORIE: ${opts.category}` : null,
  ].filter(Boolean).join("\n");
  const raw = await anthropicMessage({ apiKey: anthropicKey, system: BRIEF_SYSTEM, user, model: DEFAULT_MODEL, maxTokens: 500 });
  const p = extractJson<any>(raw);
  if (!p || typeof p.image_prompt !== "string" || !p.image_prompt.trim()) {
    throw new Error("Geen geldige beeld-brief van Claude");
  }
  return {
    image_prompt: p.image_prompt.trim(),
    alt: typeof p.alt === "string" && p.alt.trim() ? p.alt.trim() : opts.title,
  };
}

// Genereert een foto via Imagen (Gemini API). Retourneert base64 + mime (aanroeper maakt de data-URI).
export async function generateImagenPhoto(geminiKey: string, prompt: string): Promise<{ b64: string; mime: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": geminiKey, "content-type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: "16:9", personGeneration: "allow_adult" },
    }),
  });
  if (!res.ok) throw new Error(`Imagen HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const pred = data?.predictions?.[0];
  const b64 = pred?.bytesBase64Encoded;
  if (!b64 || typeof b64 !== "string") throw new Error("Imagen gaf geen beeld terug");
  return { b64, mime: typeof pred.mimeType === "string" ? pred.mimeType : "image/png" };
}
