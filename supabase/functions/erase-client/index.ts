import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_NO_METHODS } from "../_shared/cors.ts";

const corsHeaders = CORS_NO_METHODS;

type RequestBody = {
  client_id?: string;
  confirmation_name?: string;
};

type ErasureResult = {
  client_id?: string;
  client_number?: number | null;
  erased_client_label?: string;
  portal_user_id?: string | null;
  counts?: Record<string, number>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string, field?: string) {
  return json({ status: "error", message, field }, status);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, "Serverconfiguratie ontbreekt");
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const auth = await requireAdminOrInternal(req, serviceClient, corsHeaders, { allowInternal: false });
    if (!auth.ok) return auth.response;
    if (auth.role !== "admin" || !auth.userId) {
      return jsonError(403, "Alleen admins mogen klantprofielen verwijderen");
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const clientId = asString(body.client_id).trim();
    const confirmationName = asString(body.confirmation_name).trim();

    if (!isUuid(clientId)) {
      return jsonError(400, "Ongeldige klant", "client_id");
    }

    const { data: client, error: clientError } = await serviceClient
      .from("clients")
      .select("id, client_number, company_name, status")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) {
      return jsonError(500, clientError.message);
    }
    if (!client) {
      return jsonError(404, "Klant niet gevonden");
    }
    if (client.status === "verwijderd") {
      return jsonError(409, "Klantprofiel is al verwijderd");
    }

    const expectedName = normalizeName(client.company_name ?? "");
    if (!expectedName || normalizeName(confirmationName) !== expectedName) {
      return jsonError(
        400,
        "Typ de bedrijfsnaam om dit klantprofiel te verwijderen",
        "confirmation_name",
      );
    }

    const { data, error } = await serviceClient.rpc("erase_client_for_privacy", {
      p_client_id: clientId,
      p_reason: "Klantprofiel verwijderd via admin",
      p_performed_by: auth.userId,
    });

    if (error) {
      const status = error.message.includes("Alleen admins") ? 403 : 400;
      return jsonError(status, error.message);
    }

    const result = (data ?? {}) as ErasureResult;
    const portalUserId = result.portal_user_id ?? null;
    let authUserDeleted = false;
    let authDeleteError: string | null = null;

    if (portalUserId) {
      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(portalUserId);
      if (deleteError) {
        authDeleteError = deleteError.message;
      } else {
        authUserDeleted = true;
        await serviceClient
          .from("client_erasure_log")
          .update({ auth_user_deleted: true })
          .eq("client_id", clientId);
      }
    }

    return json({
      status: authDeleteError ? "partial" : "ok",
      message: authDeleteError
        ? "Klantgegevens zijn geanonimiseerd, maar het auth-account kon niet automatisch worden verwijderd"
        : "Klantprofiel verwijderd",
      auth_user_deleted: authUserDeleted,
      auth_delete_error: authDeleteError,
      ...result,
    });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Onbekende fout");
  }
});
