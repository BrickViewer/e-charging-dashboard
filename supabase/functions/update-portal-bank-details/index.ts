import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { CORS_NO_METHODS } from "../_shared/cors.ts";

const corsHeaders = CORS_NO_METHODS;

type RequestBody = {
  currentPassword: string;
  payoutAccountHolderName: string;
  payoutIban: string;
  payoutBic?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseBody(value: unknown): RequestBody {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    currentPassword: asString(record.currentPassword),
    payoutAccountHolderName: asString(record.payoutAccountHolderName),
    payoutIban: asString(record.payoutIban),
    payoutBic: asString(record.payoutBic) || null,
  };
}

function normalizeCompact(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

const IBAN_COUNTRY_LENGTHS: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MR: 27,
  MT: 31,
  MU: 30,
  NL: 18,
  NO: 15,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  SA: 24,
  SC: 31,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
};

function isValidIban(value: string) {
  const iban = normalizeCompact(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;
  if (IBAN_COUNTRY_LENGTHS[iban.slice(0, 2)] !== iban.length) return false;

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const code = character.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : character;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function isValidBic(value: string) {
  const bic = normalizeCompact(value);
  return bic === "" || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Serverconfiguratie ontbreekt" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Niet ingelogd" }, 401);
  }

  const body = parseBody(await req.json().catch(() => ({})));
  const accountHolder = body.payoutAccountHolderName.trim();
  const iban = normalizeCompact(body.payoutIban);
  const bic = normalizeCompact(body.payoutBic ?? "");
  const now = new Date().toISOString();

  if (body.currentPassword.length < 1) {
    return jsonResponse({ field: "currentPassword", error: "Vul uw huidige wachtwoord in" }, 400);
  }
  if (accountHolder.length < 2) {
    return jsonResponse({ field: "payoutAccountHolderName", error: "Vul de naam van de rekeninghouder in" }, 400);
  }
  if (!isValidIban(iban)) {
    return jsonResponse({ field: "payoutIban", error: "Vul een geldig IBAN in" }, 400);
  }
  if (!isValidBic(bic)) {
    return jsonResponse({ field: "payoutBic", error: "Vul een geldige BIC in of laat dit veld leeg" }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: "Niet ingelogd" }, 401);
  }

  const user = authData.user;
  if (!user.email) {
    return jsonResponse({ error: "Geen login e-mail gevonden" }, 400);
  }

  const verifyClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { error: passwordError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: body.currentPassword,
  });

  if (passwordError) {
    return jsonResponse({ field: "currentPassword", error: "Huidig wachtwoord klopt niet" }, 403);
  }

  const { data: client, error: clientError } = await serviceClient
    .from("clients")
    .select("id, contact_email")
    .eq("portal_user_id", user.id)
    .maybeSingle();

  if (clientError) {
    return jsonResponse({ error: clientError.message }, 500);
  }
  if (!client) {
    return jsonResponse({ error: "Geen klantportaal gekoppeld aan deze gebruiker" }, 403);
  }

  const { data: existingPaymentDetails, error: detailsError } = await serviceClient
    .from("client_payment_details")
    .select("invoice_email")
    .eq("client_id", client.id)
    .maybeSingle();

  if (detailsError) {
    return jsonResponse({ error: detailsError.message }, 500);
  }

  const invoiceEmail = existingPaymentDetails?.invoice_email ?? client.contact_email;
  if (!invoiceEmail) {
    return jsonResponse({ error: "Sla eerst de bedrijfsgegevens met factuurmail op" }, 400);
  }

  const last4 = iban.slice(-4);

  const { error: upsertError } = await serviceClient
    .from("client_payment_details")
    .upsert(
      {
        client_id: client.id,
        invoice_email: invoiceEmail,
        payout_account_holder_name: accountHolder,
        payout_iban: iban,
        payout_iban_last4: last4,
        payout_bic: bic || null,
        account_holder_confirmed: true,
        status: "saved",
        submitted_at: now,
        verified_at: null,
        verified_by: null,
        rejected_at: null,
        rejection_reason: null,
        updated_at: now,
      },
      { onConflict: "client_id" },
    );

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 400);
  }

  const { error: clientUpdateError } = await serviceClient
    .from("clients")
    .update({
      payment_onboarding_status: "saved",
      payment_onboarding_submitted_at: now,
      payment_onboarding_verified_at: null,
    })
    .eq("id", client.id);

  if (clientUpdateError) {
    return jsonResponse({ error: clientUpdateError.message }, 500);
  }

  await serviceClient.from("activity_log").insert({
    client_id: client.id,
    user_id: user.id,
    action: "client_bank_details_changed",
    description: "Klant heeft bankgegevens aangepast",
    metadata: {
      iban_last4: last4,
      bic_present: Boolean(bic),
    },
  });

  return jsonResponse({
    paymentDetails: {
      client_id: client.id,
      invoice_email: invoiceEmail,
      payout_account_holder_name: accountHolder,
      payout_iban_masked: `•••• ${last4}`,
      payout_iban_last4: last4,
      payout_bic: bic || null,
      account_holder_confirmed: true,
      status: "saved",
      updated_at: now,
    },
  });
});
