// Gedeelde Claude-helper voor de content-machine (Laag C/D van de SEO-blogmotor). Slaapt netjes als er
// geen sleutel is: getAnthropicKey geeft dan null en de aanroeper valt terug. Geen SDK; raw /v1/messages.
// We sturen bewust alleen model/max_tokens/system/messages (geen thinking/temperature/top_p) zodat het op
// elk model werkt (sommige parameters geven een 400 op Opus 4.8).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveSecret } from "./secrets.ts";

export const DEFAULT_MODEL = "claude-opus-4-8";

// Eén poging mag nooit onbegrensd hangen: de edge-wandklok (400 s) is hard, en een
// isolate die daarop sneuvelt laat niets achter — geen blog, geen log, geen mail.
// Maar een harde totaalduur-cap is dodelijk voor lange generaties (web-search-runs
// van 3-6 min zijn normaal): die zou elke poging afbreken en de retry-lus over de
// wandklok duwen. Daarom streamen we en bewaken we STILTE: zolang er bytes
// binnenkomen leeft de verbinding; pas na 90 s zonder enige chunk breken we af
// en is het een gewone, retrybare fout.
const IDLE_TIMEOUT_MS = 90_000;

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
  const retries = opts.retries ?? 3;
  // Tokenbudget PER POGING: een beurt die op max_tokens sneuvelde, faalt met identiek budget
  // deterministisch opnieuw (dat was de doodsoorzaak van de feitencontrole op 15 juli). Bij
  // zo'n afbreking escaleren we het budget ×1,5 (cap 32k) voor de volgende poging.
  let budget = opts.maxTokens ?? 16000;
  const body: Record<string, unknown> = {
    model,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    stream: true,
  };
  // Optionele server-tools (bv. web_search); alleen meesturen indien opgegeven zodat andere calls identiek blijven.
  if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    body.max_tokens = budget;
    // Stilte-bewaking: elke ontvangen chunk schuift de deadline op.
    const ctrl = new AbortController();
    let idleTimer = setTimeout(() => ctrl.abort(new Error("Anthropic-stream stil > 90s")), IDLE_TIMEOUT_MS);
    const touch = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ctrl.abort(new Error("Anthropic-stream stil > 90s")), IDLE_TIMEOUT_MS);
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel().catch(() => {});
        lastErr = new Error(`Anthropic HTTP ${res.status}`);
      } else if (!res.ok) {
        // Niet-herhaalbare 4xx (bv. ongeldig model of sleutel): meteen falen, niet retryen met backoff.
        const err = new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        (err as any).nonRetryable = true;
        throw err;
      } else if (!res.body) {
        lastErr = new Error("Anthropic-respons zonder body");
      } else {
        // SSE uitlezen: alleen text_delta's van tekstblokken samenvoegen; een
        // error-event van de API telt als retrybare fout.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let text = "";
        let stopReason: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          touch();
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let ev: any;
            try { ev = JSON.parse(payload); } catch { continue; }
            if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
            if (ev?.type === "message_delta" && typeof ev.delta?.stop_reason === "string") stopReason = ev.delta.stop_reason;
            if (ev?.type === "error") throw new Error(`Anthropic stream-error: ${ev.error?.message ?? "onbekend"}`);
          }
        }
        // Een afgebroken beurt (pause_turn bij lange tool-runs, max_tokens) levert
        // onvolledige tekst — dat mag NOOIT als geldig antwoord doorgaan. Retrybaar;
        // bij max_tokens met verhoogd budget (zie de catch hieronder).
        if (stopReason && stopReason !== "end_turn" && stopReason !== "stop_sequence") {
          const err = new Error(`Anthropic-stream eindigde voortijdig (stop_reason=${stopReason})`);
          if (stopReason === "max_tokens") (err as any).maxTokensHit = true;
          throw err;
        }
        if (!text) throw new Error("Lege respons van Claude");
        return text;
      }
    } catch (e) {
      // Permanente fouten (niet-herhaalbare 4xx) meteen doorgooien i.p.v. retryen.
      if (e && (e as { nonRetryable?: boolean }).nonRetryable) throw e;
      if (e && (e as { maxTokensHit?: boolean }).maxTokensHit) budget = Math.min(Math.ceil(budget * 1.5), 32000);
      lastErr = e;
    } finally {
      clearTimeout(idleTimer);
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  throw lastErr instanceof Error ? lastErr : new Error("Anthropic-aanroep mislukt");
}

// Robuuste JSON-extractie: strip ```json-fences en pak het buitenste { ... }.
// Faalt het parsen, dan één herkansing met ge-sanitize-de control-characters: modellen
// lekken soms een rauwe newline/tab in een lange HTML-string ("Bad control character in
// string literal") en dat mag geen hele revisie-iteratie kosten.
export function extractJson<T>(raw: string): T {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    return JSON.parse(s) as T;
  } catch (e) {
    const cleaned = sanitizeJsonControlChars(s);
    if (cleaned === s) throw e;
    return JSON.parse(cleaned) as T;
  }
}

// Escapet rauwe control-characters BINNEN string-literals (newline→\n, tab→\t, rest strippen);
// buiten literals blijft alles ongemoeid. Kleine state-machine, geen dependency.
function sanitizeJsonControlChars(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (code < 0x20) {
        if (ch === "\n") out += "\\n";
        else if (ch === "\t") out += "\\t";
        else if (ch === "\r") out += "\\r";
        // overige control-characters: strippen
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}
