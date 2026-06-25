// Gedeelde Claude-helper voor de content-machine (Laag C/D van de SEO-blogmotor). Slaapt netjes als er
// geen sleutel is: getAnthropicKey geeft dan null en de aanroeper valt terug. Geen SDK; raw /v1/messages.
// We sturen bewust alleen model/max_tokens/system/messages (geen thinking/temperature/top_p) zodat het op
// elk model werkt (sommige parameters geven een 400 op Opus 4.8).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveSecret } from "./secrets.ts";

export const DEFAULT_MODEL = "claude-opus-4-8";

// Sleutel uit edge-env (ANTHROPIC_API_KEY) of Vault (anthropic_api_key). Alleen op naam; nooit loggen.
export async function getAnthropicKey(sb: any): Promise<string | null> {
  return await resolveSecret(sb, ["ANTHROPIC_API_KEY"], "anthropic_api_key");
}

// Roept de Messages-API aan en geeft de samengevoegde tekst terug. Retry met backoff op 429/5xx.
export async function anthropicMessage(opts: {
  apiKey: string;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  retries?: number;
  tools?: unknown[];
}): Promise<string> {
  const model = opts.model || DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 16000;
  const retries = opts.retries ?? 3;
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  };
  // Optionele server-tools (bv. web_search); alleen meesturen indien opgegeven zodat andere calls identiek blijven.
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Anthropic HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      } else {
        const data = await res.json();
        const text = (data.content ?? [])
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text)
          .join("");
        if (!text) throw new Error("Lege respons van Claude");
        return text;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("Anthropic-aanroep mislukt");
}

// Robuuste JSON-extractie: strip ```json-fences en pak het buitenste { ... }.
export function extractJson<T>(raw: string): T {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s) as T;
}
