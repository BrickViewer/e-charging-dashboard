// Dunne HTTP-client voor de E-Group e-portal-endpoints (intake + materiaalsync).
// Zelfde stijl als eflux-sync/road-api.ts: fetch met bearer + retry op 429 +
// nette foutklasse. Gedeeld door order-handoff en order-material-sync.

export class EgroupApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "EgroupApiError";
  }
}

export interface EgroupConfig {
  intakeUrl: string;
  sharedSecret: string;
}

export interface EgroupIntakeResponse {
  order_id: string;
  order_number: string;
}

// Generieke POST naar een e-portal-endpoint: gedeelde secret-headers,
// Idempotency-Key en retry op 429. Gooit EgroupApiError bij een niet-2xx.
export async function postJson(
  url: string,
  payload: unknown,
  sharedSecret: string,
  idempotencyKey: string,
  attempt = 0,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sharedSecret}`,
      "x-echarging-secret": sharedSecret,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 429 && attempt < 3) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    return postJson(url, payload, sharedSecret, idempotencyKey, attempt + 1);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch (_) {
      // body niet JSON
    }
    throw new EgroupApiError(res.status, message);
  }

  return await res.json().catch(() => ({}));
}

export class EgroupClient {
  constructor(private config: EgroupConfig) {}

  // Verstuurt de handoff-payload. Idempotency-Key zorgt dat E-Group bij herhaling
  // dezelfde order teruggeeft i.p.v. een duplicaat aan te maken.
  async intakeOrder(payload: unknown, idempotencyKey: string): Promise<EgroupIntakeResponse> {
    // deno-lint-ignore no-explicit-any
    const data = (await postJson(this.config.intakeUrl, payload, this.config.sharedSecret, idempotencyKey)) as any;
    if (!data?.order_id) {
      throw new EgroupApiError(502, "E-Group gaf geen order_id terug");
    }
    return { order_id: String(data.order_id), order_number: String(data.order_number ?? "") };
  }
}
