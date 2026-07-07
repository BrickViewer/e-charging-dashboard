import { FormEvent, HTMLAttributes, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { usePostcodeLookup } from "@/hooks/usePostcodeLookup";
import { useDemoMode } from "@/contexts/demoModeContextValue";
import { isValidIban } from "@/lib/iban";
import { evaluatePassword } from "@/lib/passwordStrength";
import { PasswordStrengthMeter, usePasswordStrength } from "@/components/PasswordStrengthMeter";
// Gedeelde copy-constanten (bewuste uitzondering op de duplicatie om copy-drift te voorkomen).
import { accountHolderHelp, ERE_OPTIN_DISCLAIMER, ERE_RECEIVED_NOTICE, invoiceNameHelp } from "@/lib/portalProfile";
import { cn } from "@/lib/utils";
import {
  changePortalLoginEmail,
  changePortalPassword,
  PortalFieldError,
  updatePortalBankDetails,
  updatePortalCompanyDetails,
} from "@/services/clientPaymentDetails";
import type { PortalClient, PortalPaymentDetails } from "@/types/db";

type CompanyDetailsFormProps = {
  client: PortalClient;
  paymentDetails?: PortalPaymentDetails | null;
};

type VatStatusChoice = "vat_liable" | "kor" | "private" | "";

type CompanyFormState = {
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

type BankFormState = {
  payoutAccountHolderName: string;
  payoutIban: string;
  payoutBic: string;
  currentPassword: string;
};

type LoginEmailFormState = {
  loginEmail: string;
  currentPassword: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type SecurityAction = "email" | "password" | null;

type CompanyErrors = Partial<Record<keyof CompanyFormState, string>>;
type BankErrors = Partial<Record<keyof BankFormState, string>>;
type LoginEmailErrors = Partial<Record<keyof LoginEmailFormState, string>>;
type PasswordErrors = Partial<Record<keyof PasswordFormState, string>>;

const COMPANY_REQUIRED_FIELDS: Array<keyof CompanyFormState> = [
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

// currentPassword staat hier bewust NIET meer in: eerste keer invullen = geen wachtwoord.
// Alleen bij het wijzigen van een reeds opgeslagen rekening (step-up) via requirePassword.
const BANK_REQUIRED_FIELDS: Array<keyof BankFormState> = [
  "payoutAccountHolderName",
  "payoutIban",
];

function splitContactName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function getContactPhoneParts(phone?: string | null) {
  const compact = (phone ?? "").replace(/[^\d+]/g, "");
  if (compact.startsWith("+31")) return { countryCode: "+31", phone: compact.slice(3).replace(/^0+/, "") };
  if (compact.startsWith("0031")) return { countryCode: "+31", phone: compact.slice(4).replace(/^0+/, "") };
  if (compact.startsWith("31") && compact.length > 9) return { countryCode: "+31", phone: compact.slice(2).replace(/^0+/, "") };
  return { countryCode: "+31", phone: compact.replace(/^0+/, "") };
}

function initialCompanyForm(client: PortalClient, details?: PortalPaymentDetails | null): CompanyFormState {
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

function initialBankForm(client: PortalClient, details?: PortalPaymentDetails | null): BankFormState {
  return {
    payoutAccountHolderName: details?.payout_account_holder_name ?? client.company_name ?? "",
    payoutIban: "",
    payoutBic: details?.payout_bic ?? "",
    currentPassword: "",
  };
}

function normalizeCompact(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function normalizeBtw(value: string) {
  return value.toUpperCase().replace(/[\s.-]+/g, "");
}

function normalizeKvk(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

function isValidDutchVatNumber(value: string) {
  return /^NL[0-9]{9}B[0-9]{2}$/.test(normalizeBtw(value));
}

function isValidDutchPostcode(value: string) {
  return /^[1-9][0-9]{3}\s?[A-Z]{2}$/i.test(value.trim());
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidBic(value: string) {
  const normalized = normalizeCompact(value);
  return normalized === "" || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalized);
}

function normalizeCompanyForm(form: CompanyFormState): CompanyFormState {
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

function normalizeBankForm(form: BankFormState): BankFormState {
  return {
    payoutAccountHolderName: form.payoutAccountHolderName.trim(),
    payoutIban: normalizeCompact(form.payoutIban),
    payoutBic: normalizeCompact(form.payoutBic),
    currentPassword: form.currentPassword,
  };
}

function validateCompanyForm(form: CompanyFormState): CompanyErrors {
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

function validateBankForm(form: BankFormState, requirePassword = false): BankErrors {
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

function firstError<T extends string>(fields: T[], errors: Partial<Record<T, string>>) {
  return fields.find((field) => errors[field]);
}

function applyCompanyServerError(message: string): CompanyErrors {
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

export function CompanyDetailsForm({ client, paymentDetails }: CompanyDetailsFormProps) {
  const demo = useDemoMode();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [companySaving, setCompanySaving] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [companyErrors, setCompanyErrors] = useState<CompanyErrors>({});
  const [bankErrors, setBankErrors] = useState<BankErrors>({});
  const [loginEmailErrors, setLoginEmailErrors] = useState<LoginEmailErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});

  const [companyForm, setCompanyForm] = useState<CompanyFormState>(() => initialCompanyForm(client, paymentDetails));
  const [bankForm, setBankForm] = useState<BankFormState>(() => initialBankForm(client, paymentDetails));
  const [loginEmailForm, setLoginEmailForm] = useState<LoginEmailFormState>({
    loginEmail: user?.email ?? "",
    currentPassword: "",
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [activeSecurityAction, setActiveSecurityAction] = useState<SecurityAction>(null);
  const [bankEditing, setBankEditing] = useState(!paymentDetails?.payout_iban_last4);
  // Reeds een uitbetaalrekening opgeslagen? Dan is dit een WIJZIGING → step-up (wachtwoord). Eerste keer niet.
  const bankIsChange = Boolean(paymentDetails?.payout_iban_last4);
  // Live wachtwoordsterkte voor het wijzig-wachtwoord-formulier (userInputs straffen eigen naam/e-mail af).
  const pwStrength = usePasswordStrength(passwordForm.newPassword, [
    user?.email ?? "",
    companyForm.companyName,
    companyForm.contactFirstName,
    companyForm.contactLastName,
  ]);

  useEffect(() => {
    setCompanyForm(initialCompanyForm(client, paymentDetails));
    setBankForm(initialBankForm(client, paymentDetails));
    setBankEditing(!paymentDetails?.payout_iban_last4);
    setCompanyErrors({});
    setBankErrors({});
  }, [client, paymentDetails]);

  useEffect(() => {
    setLoginEmailForm((current) => ({
      ...current,
      loginEmail: user?.email ?? "",
    }));
  }, [user?.email]);

  const updateCompany = <K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) => {
    setCompanyForm((current) => ({ ...current, [key]: value }));
    setCompanyErrors((current) => clearError(current, key));
  };

  const updateBank = <K extends keyof BankFormState>(key: K, value: BankFormState[K]) => {
    setBankForm((current) => ({ ...current, [key]: value }));
    setBankErrors((current) => clearError(current, key));
  };

  // Automatische adres-invulling (PDOK): postcode + huisnummer (uit het factuuradres) → plaats + straat.
  const { lookup: lookupAddress } = usePostcodeLookup();
  const lastAddrKey = useRef("");
  useEffect(() => {
    const pc = companyForm.billingAddressPostal.replace(/\s+/g, "").toUpperCase();
    const huis = companyForm.billingAddressStreet.match(/\d+/)?.[0] ?? "";
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(pc) || !huis) return;
    const key = `${pc}|${huis}`;
    if (key === lastAddrKey.current) return;
    const tmr = setTimeout(async () => {
      const r = await lookupAddress(companyForm.billingAddressPostal, huis);
      if (!r) return;
      lastAddrKey.current = key;
      setCompanyForm((c) => {
        const beforeNumber = c.billingAddressStreet.replace(/\d.*$/, "");
        const hasStreetName = /[a-zA-Z]/.test(beforeNumber);
        return {
          ...c,
          billingAddressCity: r.city || c.billingAddressCity,
          billingAddressStreet: hasStreetName || !r.street ? c.billingAddressStreet : `${r.street} ${huis}`,
        };
      });
    }, 500);
    return () => clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyForm.billingAddressPostal, companyForm.billingAddressStreet]);

  const updateLoginEmail = <K extends keyof LoginEmailFormState>(key: K, value: LoginEmailFormState[K]) => {
    setLoginEmailForm((current) => ({ ...current, [key]: value }));
    setLoginEmailErrors((current) => clearError(current, key));
  };

  const updatePassword = <K extends keyof PasswordFormState>(key: K, value: PasswordFormState[K]) => {
    setPasswordForm((current) => ({ ...current, [key]: value }));
    setPasswordErrors((current) => clearError(current, key));
  };

  const openSecurityAction = (action: Exclude<SecurityAction, null>) => {
    setActiveSecurityAction(action);
    setLoginEmailErrors({});
    setPasswordErrors({});
    setLoginEmailForm({
      loginEmail: user?.email ?? "",
      currentPassword: "",
    });
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const closeSecurityAction = () => {
    setActiveSecurityAction(null);
    setLoginEmailErrors({});
    setPasswordErrors({});
    setLoginEmailForm({
      loginEmail: user?.email ?? "",
      currentPassword: "",
    });
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const submitCompany = async (event: FormEvent) => {
    event.preventDefault();
    const validationErrors = validateCompanyForm(companyForm);
    const firstInvalidField = firstError(COMPANY_REQUIRED_FIELDS, validationErrors);

    if (firstInvalidField) {
      setCompanyErrors(validationErrors);
      toast.error(validationErrors[firstInvalidField] ?? "Controleer de gemarkeerde velden");
      return;
    }

    const normalized = normalizeCompanyForm(companyForm);
    setCompanyErrors({});
    setCompanyForm(normalized);

    if (demo) {
      // Demo-omgeving: validatie en UX werken, maar er wordt niets opgeslagen.
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Demo-omgeving: wijzigingen worden niet opgeslagen");
      return;
    }

    setCompanySaving(true);

    try {
      await updatePortalCompanyDetails({
        ...normalized,
        vatStatus: normalized.vatStatus === "" ? null : normalized.vatStatus,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["client-payment-details", client.id] }),
      ]);
      toast.success("Gegevens opgeslagen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gegevens opslaan mislukt";
      setCompanyErrors(applyCompanyServerError(message));
      toast.error(message);
    } finally {
      setCompanySaving(false);
    }
  };

  const submitBank = async (event: FormEvent) => {
    event.preventDefault();
    // Eerste keer bankgegevens invullen = geen wachtwoord; een bestaande rekening wijzigen = step-up.
    const requirePassword = bankIsChange;
    const validationErrors = validateBankForm(bankForm, requirePassword);
    const fields: Array<keyof BankFormState> = [...BANK_REQUIRED_FIELDS, "payoutBic"];
    if (requirePassword) fields.push("currentPassword");
    const firstInvalidField = firstError(fields, validationErrors);

    if (firstInvalidField) {
      setBankErrors(validationErrors);
      toast.error(validationErrors[firstInvalidField] ?? "Controleer de bankgegevens");
      return;
    }

    const normalized = normalizeBankForm(bankForm);
    setBankErrors({});

    if (demo) {
      // Demo-omgeving: validatie en UX werken, maar er wordt niets opgeslagen.
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Demo-omgeving: wijzigingen worden niet opgeslagen");
      setBankForm((prev) => ({ ...prev, currentPassword: "" }));
      return;
    }

    setBankSaving(true);

    try {
      await updatePortalBankDetails(normalized);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["client-payment-details", client.id] }),
      ]);
      setBankForm({ ...normalized, payoutIban: "", currentPassword: "" });
      setBankEditing(false);
      toast.success("Bankgegevens opgeslagen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bankgegevens opslaan mislukt";
      if (err instanceof PortalFieldError && err.field) {
        setBankErrors({ [err.field]: message } as BankErrors);
      } else {
        setBankErrors({});
      }
      toast.error(message);
    } finally {
      setBankSaving(false);
    }
  };

  const submitLoginEmail = async (event: FormEvent) => {
    event.preventDefault();
    const nextEmail = loginEmailForm.loginEmail.trim().toLowerCase();
    const errors: LoginEmailErrors = {};
    if (!nextEmail) errors.loginEmail = "Dit veld is verplicht";
    else if (!isValidEmail(nextEmail)) errors.loginEmail = "Vul een geldig e-mailadres in";
    if (!loginEmailForm.currentPassword) errors.currentPassword = "Vul uw huidige wachtwoord in";
    if (nextEmail === (user?.email ?? "").toLowerCase()) errors.loginEmail = "Dit is al uw login e-mail";

    if (Object.keys(errors).length > 0) {
      setLoginEmailErrors(errors);
      toast.error(Object.values(errors)[0] ?? "Controleer de gemarkeerde velden");
      return;
    }

    if (!user?.email) {
      toast.error("Geen huidige login e-mail gevonden");
      return;
    }

    if (demo) {
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Demo-omgeving: wijzigingen worden niet opgeslagen");
      setLoginEmailForm((prev) => ({ ...prev, currentPassword: "" }));
      return;
    }

    setEmailSaving(true);
    setLoginEmailErrors({});
    try {
      await changePortalLoginEmail(user.email, loginEmailForm.currentPassword, nextEmail);
      setLoginEmailForm({ loginEmail: user.email, currentPassword: "" });
      setActiveSecurityAction(null);
      toast.success("Controleer uw nieuwe e-mailadres om de wijziging te bevestigen");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login e-mail wijzigen mislukt";
      if (err instanceof PortalFieldError && err.field === "securityCurrentPassword") {
        setLoginEmailErrors({ currentPassword: message });
      } else if (err instanceof PortalFieldError && err.field) {
        setLoginEmailErrors({ [err.field]: message } as LoginEmailErrors);
      }
      toast.error(message);
    } finally {
      setEmailSaving(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    const errors: PasswordErrors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = "Vul uw huidige wachtwoord in";
    const pwEval = await evaluatePassword(passwordForm.newPassword, [
      user?.email ?? "",
      companyForm.companyName,
      companyForm.contactFirstName,
      companyForm.contactLastName,
    ]);
    if (!pwEval.ok) errors.newPassword = pwEval.warningNl ?? "Kies een sterker wachtwoord";
    if (passwordForm.newPassword !== passwordForm.confirmPassword) errors.confirmPassword = "Wachtwoorden komen niet overeen";

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      toast.error(Object.values(errors)[0] ?? "Controleer de gemarkeerde velden");
      return;
    }

    if (!user?.email) {
      toast.error("Geen huidige login e-mail gevonden");
      return;
    }

    if (demo) {
      await new Promise((r) => setTimeout(r, 400));
      toast.success("Demo-omgeving: wijzigingen worden niet opgeslagen");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      return;
    }

    setPasswordSaving(true);
    setPasswordErrors({});
    try {
      await changePortalPassword(user.email, passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setActiveSecurityAction(null);
      toast.success("Wachtwoord gewijzigd");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wachtwoord wijzigen mislukt";
      if (err instanceof PortalFieldError && err.field === "securityCurrentPassword") {
        setPasswordErrors({ currentPassword: message });
      } else if (err instanceof PortalFieldError && err.field) {
        setPasswordErrors({ [err.field]: message } as PasswordErrors);
      }
      toast.error(message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submitCompany} noValidate className="space-y-5">
        <Card className="portal-card">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-6">
              <h1 className="text-lg font-semibold text-foreground">{companyForm.vatStatus === "private" ? "Contactpersoon" : "Contactpersoon bedrijf"}</h1>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="contact-first-name" name="given-name" autoComplete="given-name" label="Voornaam" value={companyForm.contactFirstName} onChange={(value) => updateCompany("contactFirstName", value)} error={companyErrors.contactFirstName} required />
              <Field id="contact-last-name" name="family-name" autoComplete="family-name" label="Achternaam" value={companyForm.contactLastName} onChange={(value) => updateCompany("contactLastName", value)} error={companyErrors.contactLastName} required />
              <Field id="contact-email" name="email" autoComplete="email" label="Contact e-mail" type="email" value={companyForm.contactEmail} onChange={(value) => updateCompany("contactEmail", value)} error={companyErrors.contactEmail} required />
              <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                <CountryCodeField value={companyForm.contactCountryCode} onChange={(value) => updateCompany("contactCountryCode", value)} error={companyErrors.contactCountryCode} />
                <Field id="contact-phone" name="tel-national" autoComplete="tel-national" label="Telefoonnummer" value={companyForm.contactPhone} onChange={(value) => updateCompany("contactPhone", value)} error={companyErrors.contactPhone} inputMode="tel" placeholder="612345678" required />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="portal-card">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-6">
              <h1 className="text-lg font-semibold text-foreground">{companyForm.vatStatus === "private" ? "Uw gegevens" : "Bedrijfsgegevens"}</h1>
            </div>

            <div className="space-y-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem label="Klantnummer" value={client.client_number ? `#${client.client_number}` : "Nog niet bekend"} />
              </dl>

              {/* BTW-status: bepaalt de BTW-behandeling op de vergoedingsfactuur
                  én welke velden hieronder verplicht zijn. E-Charging bevestigt
                  de keuze voordat er wordt uitbetaald. */}
              <div className="space-y-2 rounded-md border border-border/80 px-3 py-3">
                <Label className="text-sm text-foreground">
                  BTW-status <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={companyForm.vatStatus}
                  onValueChange={(value) => updateCompany("vatStatus", value as VatStatusChoice)}
                  className="gap-2.5"
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <RadioGroupItem value="vat_liable" className="mt-0.5" />
                    <span className="text-sm">
                      Ik ben BTW-ondernemer
                      <span className="block text-xs text-muted-foreground">21% BTW op de vergoeding; KvK- en BTW-nummer verplicht</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <RadioGroupItem value="kor" className="mt-0.5" />
                    <span className="text-sm">
                      Ik val onder de kleineondernemersregeling (KOR)
                      <span className="block text-xs text-muted-foreground">Geen BTW op de vergoeding; KvK-nummer verplicht</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <RadioGroupItem value="private" className="mt-0.5" />
                    <span className="text-sm">
                      Ik ontvang de vergoeding als particulier
                      <span className="block text-xs text-muted-foreground">Geen BTW; geen KvK- of BTW-nummer nodig</span>
                    </span>
                  </label>
                </RadioGroup>
                {companyErrors.vatStatus && <p className="text-xs text-destructive">{companyErrors.vatStatus}</p>}
                {client.vat_status && !client.vat_status_confirmed_at && (
                  <p className="text-xs text-[hsl(var(--status-amber))]">
                    In afwachting van bevestiging door E-Charging — tot die tijd kan er nog niet worden uitbetaald.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="company-name" name="organization" autoComplete="organization" className="sm:col-span-2" label={companyForm.vatStatus === "private" ? "Naam" : "Bedrijfsnaam"} description={invoiceNameHelp(companyForm.vatStatus === "private")} value={companyForm.companyName} onChange={(value) => updateCompany("companyName", value)} error={companyErrors.companyName} required />
                <Field id="kvk" autoComplete="off" label="KvK-nummer" value={companyForm.kvk} onChange={(value) => updateCompany("kvk", value)} error={companyErrors.kvk} inputMode="numeric" required={companyForm.vatStatus !== "private"} />
                <Field id="btw-number" autoComplete="off" label="BTW-nummer" value={companyForm.btwNumber} onChange={(value) => updateCompany("btwNumber", value)} error={companyErrors.btwNumber} placeholder="NL123456789B01" required={companyForm.vatStatus === "vat_liable"} />
                <Field id="invoice-email" autoComplete="off" label="Factuurmail" type="email" value={companyForm.invoiceEmail} onChange={(value) => updateCompany("invoiceEmail", value)} error={companyErrors.invoiceEmail} required />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="billing-address-street" name="street-address" autoComplete="street-address" className="sm:col-span-3" label={companyForm.vatStatus === "private" ? "Adres" : "Factuuradres"} value={companyForm.billingAddressStreet} onChange={(value) => updateCompany("billingAddressStreet", value)} error={companyErrors.billingAddressStreet} placeholder="Straat en huisnummer" required />
                <Field id="billing-address-postal" name="postal-code" autoComplete="postal-code" label="Postcode" value={companyForm.billingAddressPostal} onChange={(value) => updateCompany("billingAddressPostal", value)} error={companyErrors.billingAddressPostal} required />
                <Field id="billing-address-city" name="address-level2" autoComplete="address-level2" className="sm:col-span-2" label="Plaats" value={companyForm.billingAddressCity} onChange={(value) => updateCompany("billingAddressCity", value)} error={companyErrors.billingAddressCity} required />
              </div>

              <div className="space-y-2 rounded-md border border-border/80 px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="calculate-ere-enabled" className="text-sm text-foreground">
                      Bereken mijn ERE's
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Tel €0,10 per geleverde kWh mee in het dashboard.
                    </p>
                  </div>
                  <Switch
                    id="calculate-ere-enabled"
                    checked={companyForm.calculateEreEnabled}
                    onCheckedChange={(checked) => updateCompany("calculateEreEnabled", checked)}
                  />
                </div>
                {client.calculate_ere_enabled ? (
                  <p className="text-xs text-[hsl(var(--status-amber))]">{ERE_RECEIVED_NOTICE}</p>
                ) : (
                  <p className="text-xs text-[hsl(var(--status-amber))]">{ERE_OPTIN_DISCLAIMER}</p>
                )}
              </div>

              <div className="flex justify-end border-t border-border pt-5">
                <Button type="submit" disabled={companySaving}>
                  {companySaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Opslaan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card className="portal-card">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Bankgegevens</h1>
              {paymentDetails?.payout_iban_last4 && !bankEditing && (
                <p className="mt-1 text-xs text-muted-foreground">
                  IBAN opgeslagen als {paymentDetails.payout_iban_masked ?? `•••• ${paymentDetails.payout_iban_last4}`}.
                </p>
              )}
            </div>
            {!bankEditing && (
              <Button type="button" variant="outline" onClick={() => setBankEditing(true)}>
                Bankgegevens wijzigen
              </Button>
            )}
          </div>

          {bankEditing ? (
            <form onSubmit={submitBank} noValidate className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="payout-account-holder-name" name="payout-account-holder" suppressManagers label="Naam rekeninghouder" description={accountHolderHelp(companyForm.vatStatus === "private")} value={bankForm.payoutAccountHolderName} onChange={(value) => updateBank("payoutAccountHolderName", value)} error={bankErrors.payoutAccountHolderName} required />
                <Field id="payout-iban" name="payout-iban" suppressManagers label="IBAN" value={bankForm.payoutIban} onChange={(value) => updateBank("payoutIban", value)} error={bankErrors.payoutIban} placeholder="NL91ABNA0417164300" required />
                <Field id="payout-bic" name="payout-bic" suppressManagers label="BIC" value={bankForm.payoutBic} onChange={(value) => updateBank("payoutBic", value)} error={bankErrors.payoutBic} placeholder="Optioneel" />
                {/* Step-up: alleen bij het WIJZIGEN van een reeds opgeslagen uitbetaalrekening. Eerste keer: geen wachtwoord. */}
                {bankIsChange && (
                  <Field id="bank-current-password" label="Huidig wachtwoord" type="password" value={bankForm.currentPassword} onChange={(value) => updateBank("currentPassword", value)} error={bankErrors.currentPassword} autoComplete="current-password" required />
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
                {paymentDetails?.payout_iban_last4 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setBankEditing(false);
                      setBankForm(initialBankForm(client, paymentDetails));
                      setBankErrors({});
                    }}
                  >
                    Annuleren
                  </Button>
                )}
                <Button type="submit" disabled={bankSaving}>
                  {bankSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Bankgegevens opslaan
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <InfoItem label="Naam rekeninghouder" value={paymentDetails?.payout_account_holder_name} />
              <InfoItem label="IBAN" value={paymentDetails?.payout_iban_masked ?? null} />
              <InfoItem label="BIC" value={paymentDetails?.payout_bic || "Niet ingevuld"} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card className="portal-card">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-foreground">Inloggen en beveiliging</h1>
          </div>

          <div className="space-y-3">
            <SecurityActionRow
              label="Login e-mail"
              value={demo ? (client?.contact_email ?? "klant@voorbeeld.nl") : (user?.email ?? "Niet bekend")}
              actionLabel="Wijzigen"
              active={activeSecurityAction === "email"}
              onAction={() => openSecurityAction("email")}
            />

            {activeSecurityAction === "email" && (
              <form onSubmit={submitLoginEmail} noValidate className="space-y-4 rounded-md border border-border/80 bg-background/20 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="login-email" label="Nieuw login e-mail" type="email" value={loginEmailForm.loginEmail} onChange={(value) => updateLoginEmail("loginEmail", value)} error={loginEmailErrors.loginEmail} autoComplete="email" required />
                  <Field id="login-current-password" label="Huidig wachtwoord" type="password" value={loginEmailForm.currentPassword} onChange={(value) => updateLoginEmail("currentPassword", value)} error={loginEmailErrors.currentPassword} autoComplete="current-password" required />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeSecurityAction} disabled={emailSaving}>
                    Annuleren
                  </Button>
                  <Button type="submit" variant="outline" disabled={emailSaving}>
                    {emailSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Opslaan
                  </Button>
                </div>
              </form>
            )}

            <SecurityActionRow
              label="Wachtwoord"
              value="Ingesteld"
              actionLabel="Wijzigen"
              active={activeSecurityAction === "password"}
              onAction={() => openSecurityAction("password")}
            />

            {activeSecurityAction === "password" && (
              <form onSubmit={submitPassword} noValidate className="space-y-4 rounded-md border border-border/80 bg-background/20 p-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field id="password-current-password" label="Huidig wachtwoord" type="password" value={passwordForm.currentPassword} onChange={(value) => updatePassword("currentPassword", value)} error={passwordErrors.currentPassword} autoComplete="current-password" required />
                  <Field id="new-password" label="Nieuw wachtwoord" type="password" value={passwordForm.newPassword} onChange={(value) => updatePassword("newPassword", value)} error={passwordErrors.newPassword} autoComplete="new-password" required />
                  <Field id="confirm-password" label="Herhaal nieuw wachtwoord" type="password" value={passwordForm.confirmPassword} onChange={(value) => updatePassword("confirmPassword", value)} error={passwordErrors.confirmPassword} autoComplete="new-password" required />
                </div>
                {passwordForm.newPassword && (
                  <PasswordStrengthMeter result={pwStrength.result} loading={pwStrength.loading} />
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeSecurityAction} disabled={passwordSaving}>
                    Annuleren
                  </Button>
                  <Button type="submit" variant="outline" disabled={passwordSaving}>
                    {passwordSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Opslaan
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function clearError<T extends string>(errors: Partial<Record<T, string>>, key: T) {
  if (!errors[key]) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value || "Niet ingevuld"}</dd>
    </div>
  );
}

function SecurityActionRow({
  label,
  value,
  actionLabel,
  active,
  onAction,
}: {
  label: string;
  value: string;
  actionLabel: string;
  active: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
      </div>
      <Button type="button" variant="outline" onClick={onAction} disabled={active} className="sm:w-auto">
        {active ? "Open" : actionLabel}
      </Button>
    </div>
  );
}

function CountryCodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const inputId = "company-details-landcode";
  const errorId = `${inputId}-error`;

  return (
    <div>
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        Landcode<span className="ml-1 text-destructive">*</span>
      </Label>
      <select
        id={inputId}
        name="tel-country-code"
        autoComplete="tel-country-code"
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm portal-card",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      >
        <option value="+31">🇳🇱 NL +31</option>
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  className,
  type = "text",
  placeholder,
  required,
  error,
  inputMode,
  autoComplete,
  name,
  description,
  suppressManagers,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  name?: string;
  description?: string;
  suppressManagers?: boolean;
}) {
  const inputId = `company-details-${id}`;
  const errorId = `${inputId}-error`;
  const descId = description ? `${inputId}-desc` : undefined;
  // Chrome negeert autoComplete="off" voor contactgegevens; "new-password" + een willekeurige
  // veldnaam voorkomen dat de browser hier e-mail/naam/adres in propt (IBAN/BIC/rekeninghouder).
  const reactId = useId();
  const resolvedName = suppressManagers ? `nf-${reactId.replace(/:/g, "")}` : name;
  const resolvedAutoComplete = suppressManagers ? "new-password" : autoComplete;
  const managerProps = suppressManagers
    ? { "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other" }
    : {};

  return (
    <div className={className}>
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {description && (
        <p id={descId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground/90">
          {description}
        </p>
      )}
      <Input
        id={inputId}
        name={resolvedName}
        value={value}
        type={type}
        inputMode={inputMode}
        autoComplete={resolvedAutoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={[error ? errorId : null, descId].filter(Boolean).join(" ") || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn("mt-1 portal-card", error && "border-destructive focus-visible:ring-destructive")}
        {...managerProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
