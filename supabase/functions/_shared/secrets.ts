// Resolvet een integratie-secret: eerst uit de edge-env (conventioneel, kan de
// gebruiker in het dashboard zetten), anders uit de Vault via de service-role
// RPC get_integration_secret. Zo werkt de koppeling zonder dat er per se env-
// secrets gezet hoeven te zijn, en kan env later voorrang krijgen.
// deno-lint-ignore no-explicit-any
export async function resolveSecret(sb: any, envKeys: string[], vaultName: string): Promise<string | null> {
  for (const k of envKeys) {
    const v = Deno.env.get(k);
    if (v) return v;
  }
  const { data, error } = await sb.rpc("get_integration_secret", { p_name: vaultName });
  if (error) return null;
  return (data as string | null) ?? null;
}
