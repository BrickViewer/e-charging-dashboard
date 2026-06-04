import { supabase } from "@/integrations/supabase/client";
import type { PortalPaymentDetails } from "@/types/db";

export class PortalFieldError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "PortalFieldError";
    this.field = field;
  }
}

export type UpdatePortalCompanyDetailsInput = {
  companyName: string;
  kvk: string;
  btwNumber: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactCountryCode: string;
  contactPhone: string;
  billingAddressStreet: string;
  billingAddressPostal: string;
  billingAddressCity: string;
  invoiceEmail: string;
  calculateEreEnabled: boolean;
};

export type UpdatePortalBankDetailsInput = {
  currentPassword: string;
  payoutAccountHolderName: string;
  payoutIban: string;
  payoutBic: string;
};

type RpcResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type PortalRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult<unknown>>;
};

type BankDetailsResponse = {
  paymentDetails?: PortalPaymentDetails;
  field?: string;
  error?: string;
};

export async function updatePortalCompanyDetails(input: UpdatePortalCompanyDetailsInput) {
  const { error } = await (supabase as unknown as PortalRpcClient).rpc("update_portal_company_details", {
    p_company_name: input.companyName,
    p_kvk: input.kvk,
    p_btw_number: input.btwNumber,
    p_contact_first_name: input.contactFirstName,
    p_contact_last_name: input.contactLastName,
    p_contact_email: input.contactEmail,
    p_contact_country_code: input.contactCountryCode,
    p_contact_phone: input.contactPhone,
    p_billing_address_street: input.billingAddressStreet,
    p_billing_address_postal: input.billingAddressPostal,
    p_billing_address_city: input.billingAddressCity,
    p_invoice_email: input.invoiceEmail,
    p_calculate_ere_enabled: input.calculateEreEnabled,
  });

  if (error) throw new Error(error.message);
}

export async function updatePortalBankDetails(input: UpdatePortalBankDetailsInput) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData.session) throw new Error("U bent niet ingelogd");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase configuratie ontbreekt");

  const response = await fetch(`${supabaseUrl}/functions/v1/update-portal-bank-details`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => ({}))) as BankDetailsResponse;

  if (!response.ok) {
    throw new PortalFieldError(payload.error ?? "Bankgegevens opslaan mislukt", payload.field);
  }
  if (!payload.paymentDetails) {
    throw new Error("Bankgegevens opslaan mislukt");
  }

  return payload.paymentDetails;
}

export async function changePortalLoginEmail(currentEmail: string, currentPassword: string, newEmail: string) {
  const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
  const normalizedNewEmail = newEmail.trim().toLowerCase();

  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: normalizedCurrentEmail,
    password: currentPassword,
  });
  if (passwordError) throw new PortalFieldError("Huidig wachtwoord klopt niet", "securityCurrentPassword");

  const { error } = await supabase.auth.updateUser(
    { email: normalizedNewEmail },
    { emailRedirectTo: `${window.location.origin}/portal/gegevens` },
  );
  if (error) throw new PortalFieldError(error.message, "loginEmail");
}

export async function changePortalPassword(currentEmail: string, currentPassword: string, newPassword: string) {
  const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: normalizedCurrentEmail,
    password: currentPassword,
  });
  if (passwordError) throw new PortalFieldError("Huidig wachtwoord klopt niet", "securityCurrentPassword");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new PortalFieldError(error.message, "newPassword");
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/wachtwoord-herstellen`,
  });
  if (error) throw error;
}

export async function completePasswordReset(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
