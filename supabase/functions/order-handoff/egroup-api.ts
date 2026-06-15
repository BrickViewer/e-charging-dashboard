// Dunne HTTP-client voor de E-Group intake-endpoint. Zelfde stijl als
// eflux-sync/road-api.ts: fetch met bearer + retry op 429 + nette foutklasse.

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

export class EgroupClient {
  constructor(private config: EgroupConfig) {}

  // Verstuurt de handoff-payload. Idempotency-Key zorgt dat E-Group bij herhaling
  // dezelfde order teruggeeft i.p.v. een duplicaat aan te maken.
  async intakeOrder(payload: unknown, idempotencyKey: string, attempt = 0): Promise<EgroupIntakeResponse> {
    const res = await fetch(this.config.intakeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.sharedSecret}`,
        "x-echarging-secret": this.config.sharedSecret,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429 && attempt < 3) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      return this.intakeOrder(payload, idempotencyKey, attempt + 1);
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

    const data = await res.json();
    if (!data?.order_id) {
      throw new EgroupApiError(502, "E-Group gaf geen order_id terug");
    }
    return { order_id: String(data.order_id), order_number: String(data.order_number ?? "") };
  }
}

