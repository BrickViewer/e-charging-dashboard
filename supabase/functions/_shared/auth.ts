import { createClient } from "jsr:@supabase/supabase-js@2";

type Role = "admin" | "manager" | "viewer" | "sales" | "marketing";

interface AuthOk {
  ok: true;
  kind: "internal" | "user";
  userId?: string;
  role?: Role;
}

interface AuthDenied {
  ok: false;
  response: Response;
}

interface AuthOptions {
  allowInternal?: boolean;
  // Sta ook de 'sales'-rol toe (bv. de configurator-launcher). Default false zodat
  // overige functies admin/manager-only blijven.
  allowSales?: boolean;
  // Sta ook de 'marketing'-rol toe (content-machine). Default false.
  allowMarketing?: boolean;
}

interface ServiceClient {
  from(table: string): {
    select(columns: string): {
      // Eén gebruiker kan meerdere rollen hebben (bv. superadmin = admin + superadmin),
      // dus we halen alle rijen op i.p.v. .maybeSingle() (die faalt bij >1 rij).
      eq(column: string, value: string): Promise<{ data: { role?: string }[] | null; error: Error | null }>;
    };
  };
}

const encoder = new TextEncoder();

export function timingSafeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function jsonError(status: number, message: string, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ status: status === 401 ? "unauthorized" : "forbidden", message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireAdminOrInternal(
  req: Request,
  serviceClient: ServiceClient,
  corsHeaders: Record<string, string>,
  options: AuthOptions = {},
): Promise<AuthOk | AuthDenied> {
  const { allowInternal = true, allowSales = false, allowMarketing = false } = options;
  const internalSecret = req.headers.get("x-internal-secret") ?? "";

  if (internalSecret) {
    if (!allowInternal) {
      return { ok: false, response: jsonError(403, "Interne secret is niet toegestaan voor deze functie", corsHeaders) };
    }

    const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
    if (expectedSecret && timingSafeEqual(internalSecret, expectedSecret)) {
      return { ok: true, kind: "internal" };
    }

    return { ok: false, response: jsonError(401, "Ongeldige interne secret", corsHeaders) };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: jsonError(401, "Authorization header ontbreekt", corsHeaders) };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: jsonError(401, "Ongeldige sessie", corsHeaders) };
  }

  const { data: roleRows, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (roleError) throw roleError;

  const roles = (roleRows ?? []).map((r) => r.role);
  // superadmin telt als admin-niveau (heeft sowieso volledige beheer-rechten)
  const role: Role | undefined =
    roles.includes("admin") || roles.includes("superadmin")
      ? "admin"
      : roles.includes("manager")
      ? "manager"
      : allowSales && roles.includes("sales")
      ? "sales"
      : allowMarketing && roles.includes("marketing")
      ? "marketing"
      : undefined;
  if (role === "admin" || role === "manager" || role === "sales" || role === "marketing") {
    return { ok: true, kind: "user", userId: user.id, role };
  }

  const extra = `${allowSales ? "/sales" : ""}${allowMarketing ? "/marketing" : ""}`;
  return {
    ok: false,
    response: jsonError(403, `Alleen admin/manager${extra} mag deze actie uitvoeren`, corsHeaders),
  };
}
