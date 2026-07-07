// Gedeelde portaal-profiel logica: types, validatie en normalisatie voor de klantgegevens.
// Wordt gebruikt door zowel het "Mijn gegevens"-formulier (CompanyDetailsForm) als de
// onboarding-wizard, zodat beide identiek valideren en exact matchen met de RPC
// `update_portal_company_details` + de edge `update-portal-bank-details`.

import { isValidIban } from "@/lib/iban";
import type { PortalClient, PortalPaymentDetails } from "@/types/db";

export type VatStatusChoice = "vat_liable" | "kor" | "private" | "";

export type CompanyFormState = {
  companyName: string;
  vatStatus: VatStatusChoice;
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

export type BankFormState = {
  payoutAccountHolderName: string;
  payoutIban: string;
  payoutBic: string;
  currentPassword: string;
};

export type CompanyErrors = Partial<Record<keyof CompanyFormState, string>>;
export type BankErrors = Partial<Record<keyof BankFormState, string>>;

// ERE-copy op één plek zodat formulier en wizard niet uit elkaar lopen.
export const ERE_HELP = "Tel €0,10 per geleverde kWh mee in het dashboard.";
export const ERE_OPTIN_DISCLAIMER =
  "Aanmelden voor ERE-certificaten kan binnenkort. Zet je dit aan en sla je op, dan geef je aan dat je ERE's wilt en nemen we binnenkort contact met je op om ze aan te melden. De bedragen in je dashboard zijn een indicatie.";
export const ERE_RECEIVED_NOTICE =
  "We hebben je ERE-aanvraag ontvangen en nemen binnenkort contact met je op om je ERE-certificaten aan te melden. De bedragen in je dashboard zijn een indicatie.";

// Uitleg bij de bedrijfsnaam/naam: die verschijnt op de factuur/betaalspecificatie en is een
// ander begrip dan de contactpersoon of de rekeninghouder. Op één plek zodat wizard en
// "Mijn gegevens" niet uit elkaar lopen.
export function invoiceNameHelp(isPrivate: boolean): string {
  return isPrivate
    ? "Deze naam komt op je betaalspecificatie te staan."
    : "Deze naam komt op de factuur en betaalspecificatie te staan — dit is niet per se de contactpersoon of de rekeninghouder.";
}

export const COMPANY_REQUIRED_FIELDS: Array<keyof CompanyFormState> = [
  "companyName",
  "vatStatus",
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactCountryCode",
  "contactPhone",
  "billingAddressStreet",
  "billingAddressPostal",
  "billingAddressCity",
  "invoiceEmail",
];

// currentPassword staat hier bewust NIET meer in: bij de eerste keer bankgegevens invullen
// vragen we geen wachtwoord. Alleen bij het WIJZIGEN van een reeds opgeslagen rekening
// (step-up) wordt het wachtwoord verplicht — via de requirePassword-parameter hieronder.
export const BANK_REQUIRED_FIELDS: Array<keyof BankFormState> = [
  "payoutAccountHolderName",
  "payoutIban",
];

export function splitContactName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function getContactPhoneParts(phone?: string | null) {
  const compact = (phone ?? "").replace(/[^\d+]/g, "");
  if (compact.startsWith("+31")) return { countryCode: "+31", phone: compact.slice(3).replace(/^0+/, "") };
  if (compact.startsWith("0031")) return { countryCode: "+31", phone: compact.slice(4).replace(/^0+/, "") };
  if (compact.startsWith("31") && compact.length > 9) return { countryCode: "+31", phone: compact.slice(2).replace(/^0+/, "") };
  return { countryCode: "+31", phone: compact.replace(/^0+/, "") };
}

export function initialCompanyForm(client: PortalClient, details?: PortalPaymentDetails | null): CompanyFormState {
  const contactName = splitContactName(client.contact_name);
  const contactPhone = getContactPhoneParts(client.contact_phone);

  return {
    companyName: client.company_name ?? "",
    vatStatus: (client.vat_status as VatStatusChoice) ?? "",
    kvk: client.kvk ?? "",
    btwNumber: client.btw_number ?? "",
    contactFirstName: contactName.firstName,
    contactLastName: contactName.lastName,
    contactEmail: client.contact_email ?? "",
    contactCountryCode: contactPhone.countryCode,
    contactPhone: contactPhone.phone,
    billingAddressStreet: client.billing_address_street ?? "",
    billingAddressPostal: client.billing_address_postal ?? "",
    billingAddressCity: client.billing_address_city ?? "",
    invoiceEmail: details?.invoice_email ?? client.contact_email ?? "",
    calculateEreEnabled: client.calculate_ere_enabled ?? false,
  };
}

export function initialBankForm(client: PortalClient, details?: PortalPaymentDetails | null): BankFormState {
  return {
    payoutAccountHolderName: details?.payout_account_holder_name ?? client.company_name ?? "",
    payoutIban: "",
    payoutBic: details?.payout_bic ?? "",
    currentPassword: "",
  };
}

export function normalizeCompact(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

export function normalizeBtw(value: string) {
  return value.toUpperCase().replace(/[\s.-]+/g, "");
}

export function normalizeKvk(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

export function isValidDutchVatNumber(value: string) {
  return /^NL[0-9]{9}B[0-9]{2}$/.test(normalizeBtw(value));
}

export function isValidDutchPostcode(value: string) {
  return /^[1-9][0-9]{3}\s?[A-Z]{2}$/i.test(value.trim());
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidBic(value: string) {
  const normalized = normalizeCompact(value);
  return normalized === "" || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalized);
}

export function normalizeCompanyForm(form: CompanyFormState): CompanyFormState {
  return {
    companyName: form.companyName.trim(),
    vatStatus: form.vatStatus,
    kvk: normalizeKvk(form.kvk),
    btwNumber: normalizeBtw(form.btwNumber),
    contactFirstName: form.contactFirstName.trim(),
    contactLastName: form.contactLastName.trim(),
    contactEmail: form.contactEmail.trim().toLowerCase(),
    contactCountryCode: form.contactCountryCode || "+31",
    contactPhone: normalizePhone(form.contactPhone),
    billingAddressStreet: form.billingAddressStreet.trim(),
    billingAddressPostal: normalizeCompact(form.billingAddressPostal),
    billingAddressCity: form.billingAddressCity.trim(),
    invoiceEmail: form.invoiceEmail.trim().toLowerCase(),
    calculateEreEnabled: form.calculateEreEnabled,
  };
}

export function normalizeBankForm(form: BankFormState): BankFormState {
  return {
    payoutAccountHolderName: form.payoutAccountHolderName.trim(),
    payoutIban: normalizeCompact(form.payoutIban),
    payoutBic: normalizeCompact(form.payoutBic),
    currentPassword: form.currentPassword,
  };
}

export function validateCompanyForm(form: CompanyFormState): CompanyErrors {
  const errors: CompanyErrors = {};
  const normalized = normalizeCompanyForm(form);

  for (const field of COMPANY_REQUIRED_FIELDS) {
    if (!normalized[field]) errors[field] = "Dit veld is verplicht";
  }

  if (normalized.companyName && normalized.companyName.length < 2) errors.companyName = "Vul minimaal 2 tekens in";
  // KvK verplicht voor BTW-ondernemer en KOR; BTW-nummer alleen voor BTW-ondernemer.
  if ((normalized.vatStatus === "vat_liable" || normalized.vatStatus === "kor") && !normalized.kvk) {
    errors.kvk = "Dit veld is verplicht";
  }
  if (normalized.vatStatus === "vat_liable" && !normalized.btwNumber) {
    errors.btwNumber = "Dit veld is verplicht";
  }
  if (normalized.kvk && !/^[0-9]{8}$/.test(normalized.kvk)) errors.kvk = "Vul een geldig KvK-nummer van 8 cijfers in";
  if (normalized.btwNumber && !isValidDutchVatNumber(normalized.btwNumber)) {
    errors.btwNumber = "Vul een geldig BTW-nummer in, bijvoorbeeld NL123456789B01";
  }
  if (normalized.contactFirstName && normalized.contactFirstName.length < 2) errors.contactFirstName = "Vul de voornaam van de contactpersoon in";
  if (normalized.contactLastName && normalized.contactLastName.length < 2) errors.contactLastName = "Vul de achternaam van de contactpersoon in";
  if (normalized.contactEmail && !isValidEmail(normalized.contactEmail)) errors.contactEmail = "Vul een geldig e-mailadres in";
  if (normalized.contactCountryCode !== "+31") errors.contactCountryCode = "Alleen NL +31 wordt nu ondersteund";
  if (normalized.contactPhone && !/^[1-9][0-9]{8}$/.test(normalized.contactPhone)) {
    errors.contactPhone = "Vul een geldig Nederlands telefoonnummer in zonder landcode";
  }
  if (normalized.billingAddressStreet && normalized.billingAddressStreet.length < 3) errors.billingAddressStreet = "Vul straat en huisnummer in";
  if (normalized.billingAddressPostal && !isValidDutchPostcode(normalized.billingAddressPostal)) {
    errors.billingAddressPostal = "Vul een geldige Nederlandse postcode in";
  }
  if (normalized.billingAddressCity && normalized.billingAddressCity.length < 2) errors.billingAddressCity = "Vul een geldige plaats in";
  if (normalized.invoiceEmail && !isValidEmail(normalized.invoiceEmail)) errors.invoiceEmail = "Vul een geldig e-mailadres in";

  return errors;
}

// requirePassword = true bij het wijzigen van een reeds opgeslagen uitbetaalrekening
// (step-up-beveiliging). Bij de eerste keer invullen is het wachtwoord niet vereist.
export function validateBankForm(form: BankFormState, requirePassword = false): BankErrors {
  const errors: BankErrors = {};
  const normalized = normalizeBankForm(form);

  for (const field of BANK_REQUIRED_FIELDS) {
    if (!normalized[field]) errors[field] = "Dit veld is verplicht";
  }
  if (requirePassword && !normalized.currentPassword) {
    errors.currentPassword = "Dit veld is verplicht";
  }

  if (normalized.payoutAccountHolderName && normalized.payoutAccountHolderName.length < 2) {
    errors.payoutAccountHolderName = "Vul de naam van de rekeninghouder in";
  }
  if (normalized.payoutIban && !isValidIban(normalized.payoutIban)) errors.payoutIban = "Vul een geldig IBAN in";
  if (normalized.payoutBic && !isValidBic(normalized.payoutBic)) errors.payoutBic = "Vul een geldige BIC in of laat dit veld leeg";

  return errors;
}

export function firstError<T extends string>(fields: T[], errors: Partial<Record<T, string>>) {
  return fields.find((field) => errors[field]);
}

export function applyCompanyServerError(message: string): CompanyErrors {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("btw")) return { btwNumber: message };
  if (lowerMessage.includes("kvk")) return { kvk: message };
  if (lowerMessage.includes("bedrijfsnaam")) return { companyName: message };
  if (lowerMessage.includes("factuurmail")) return { invoiceEmail: message };
  if (lowerMessage.includes("factuuradres")) {
    return {
      billingAddressStreet: message,
      billingAddressPostal: message,
      billingAddressCity: message,
    };
  }
  if (lowerMessage.includes("contact")) {
    return {
      contactFirstName: message,
      contactLastName: message,
      contactEmail: message,
      contactPhone: message,
    };
  }
  return {};
}
