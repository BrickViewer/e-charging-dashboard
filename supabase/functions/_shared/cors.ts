// Gedeelde CORS-helper voor de edge functions. buildCors levert een exact header-
// object; de named presets hieronder geven PER FUNCTIE de huidige, exacte header/
// method-set terug. De bestaande drift-varianten worden BEWUST NIET genormaliseerd
// (byte-identieke preflight als voorheen). Object-sleutelvolgorde is HTTP-irrelevant,
// dus alleen de sleutelset + waarden tellen.

export interface CorsOptions {
  origin?: string;        // default "*"
  headers: string;        // exacte Access-Control-Allow-Headers-waarde
  methods?: string;       // exacte Access-Control-Allow-Methods-waarde; weglaten → géén Methods-key
  vary?: boolean;         // voeg "Vary": "Origin" toe
  cacheControl?: string;  // voeg "Cache-Control" toe
}

export function buildCors(o: CorsOptions): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Origin": o.origin ?? "*",
    "Access-Control-Allow-Headers": o.headers,
  };
  if (o.methods !== undefined) h["Access-Control-Allow-Methods"] = o.methods;
  if (o.vary) h["Vary"] = "Origin";
  if (o.cacheControl) h["Cache-Control"] = o.cacheControl;
  return h;
}

const STD_HEADERS = "authorization, x-client-info, apikey, content-type";

// POST + OPTIONS, standaard headers (de meeste interne/JWT-functies).
export const CORS_STD = buildCors({ headers: STD_HEADERS, methods: "POST, OPTIONS" });
// + x-internal-secret (functies die óók via service-to-service secret aangeroepen worden).
export const CORS_INTERNAL = buildCors({ headers: `${STD_HEADERS}, x-internal-secret`, methods: "POST, OPTIONS" });
// + x-echarging-secret (installation-completion-webhook).
export const CORS_ECHARGING_SECRET = buildCors({ headers: `${STD_HEADERS}, x-echarging-secret`, methods: "POST, OPTIONS" });
// GET + POST + OPTIONS, standaard headers (accept-client-invitation).
export const CORS_GET_POST = buildCors({ headers: STD_HEADERS, methods: "GET, POST, OPTIONS" });
// GET + POST + OPTIONS, afwijkende header-volgorde (quote-accept — drift bewust behouden).
export const CORS_GET_POST_ALT = buildCors({ headers: "authorization, content-type, apikey, x-client-info", methods: "GET, POST, OPTIONS" });
// Publieke intake met eigen secret-header (lead-intake).
export const CORS_INTAKE = buildCors({ headers: "content-type, x-intake-secret", methods: "POST, OPTIONS" });
// Zonder Access-Control-Allow-Methods (erase-client, update-portal-bank-details — drift bewust behouden).
export const CORS_NO_METHODS = buildCors({ headers: STD_HEADERS });
// Road API-proxy: alle methods (eflux-sync / eflux-test-connection road-api.ts).
export const CORS_ROAD = buildCors({ headers: `${STD_HEADERS}, x-internal-secret`, methods: "GET, POST, PATCH, DELETE, OPTIONS" });
