// Codeert de demo-config in de demo-URL (no-login demo): de demo draait dan
// volledig client-side zonder DB-query/login. Het schema MOET identiek zijn aan
// `decodeDemoConfig` in apps/admin/src/lib/demoScenarios.ts (base64url van JSON).
export function encodeDemoCfg(payload: unknown): string {
  const json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
