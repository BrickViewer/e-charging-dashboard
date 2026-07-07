import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/portal/ThemeToggle";
import { CockpitArc } from "@/components/portal/CockpitArc";
import logoBright from "@/assets/logo-bright.svg";
import logoFullColor from "@/assets/logo-full-color.svg";
import {
  Field,
  InfoItem,
  CountryCodeField,
  VatStatusField,
  EreOptInField,
  clearError,
} from "@/components/portal/profileFields";
import { useClientProfile, useClientPaymentDetails } from "@/hooks/useClientData";
import { usePortalTheme } from "@/hooks/usePortalTheme";
import { usePostcodeLookup } from "@/hooks/usePostcodeLookup";
import {
  completePortalOnboarding,
  PortalFieldError,
  updatePortalBankDetails,
  updatePortalCompanyDetails,
} from "@/services/clientPaymentDetails";
import {
  accountHolderHelp,
  applyCompanyServerError,
  BANK_REQUIRED_FIELDS,
  firstError,
  initialBankForm,
  initialCompanyForm,
  invoiceNameHelp,
  normalizeBankForm,
  normalizeCompanyForm,
  validateBankForm,
  validateCompanyForm,
  type BankErrors,
  type BankFormState,
  type CompanyErrors,
  type CompanyFormState,
} from "@/lib/portalProfile";

const STEP_LABELS = ["Welkom", "Contact", "Bedrijf", "Factuur", "ERE", "Bank", "Overzicht"];

const CONTACT_FIELDS: Array<keyof CompanyFormState> = [
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactCountryCode",
  "contactPhone",
];
const COMPANY_FIELDS: Array<keyof CompanyFormState> = ["vatStatus", "companyName", "kvk", "btwNumber"];
const INVOICE_FIELDS: Array<keyof CompanyFormState> = [
  "billingAddressStreet",
  "billingAddressPostal",
  "billingAddressCity",
  "invoiceEmail",
];

// Bij welke stap hoort een bedrijfsveld (voor "spring naar de fout" bij server-validatie).
const FIELD_STEP: Partial<Record<keyof CompanyFormState, number>> = {
  contactFirstName: 1, contactLastName: 1, contactEmail: 1, contactCountryCode: 1, contactPhone: 1,
  vatStatus: 2, companyName: 2, kvk: 2, btwNumber: 2,
  billingAddressStreet: 3, billingAddressPostal: 3, billingAddressCity: 3, invoiceEmail: 3,
};

const VAT_LABELS: Record<string, string> = {
  vat_liable: "BTW-ondernemer",
  kor: "Kleineondernemersregeling (KOR)",
  private: "Particulier",
};

function pickErrors(errs: CompanyErrors, fields: Array<keyof CompanyFormState>): CompanyErrors {
  const out: CompanyErrors = {};
  for (const f of fields) if (errs[f]) out[f] = errs[f];
  return out;
}

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isLight } = usePortalTheme();

  const { data: client, isLoading } = useClientProfile();
  const { data: paymentDetails } = useClientPaymentDetails(client?.id);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanyFormState | null>(null);
  const [bankForm, setBankForm] = useState<BankFormState | null>(null);
  const [companyErrors, setCompanyErrors] = useState<CompanyErrors>({});
  const [bankErrors, setBankErrors] = useState<BankErrors>({});

  const bankAlreadySaved = Boolean(paymentDetails?.payout_iban_last4);

  // Thema-klassen op <html> (zoals ClientLayout) zodat Radix-portals de juiste tokens krijgen.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("portal-theme");
    root.classList.toggle("light", isLight);
    return () => root.classList.remove("portal-theme", "light");
  }, [isLight]);

  // Seed de formulieren zodra de klant geladen is (voorgevuld = hervatbaar).
  const seeded = useRef(false);
  useEffect(() => {
    if (client && !seeded.current) {
      seeded.current = true;
      setCompanyForm(initialCompanyForm(client, paymentDetails));
      setBankForm(initialBankForm(client, paymentDetails));
    }
  }, [client, paymentDetails]);

  // Automatische adres-invulling (PDOK): postcode + huisnummer → plaats + straat.
  const { lookup: lookupAddress } = usePostcodeLookup();
  const lastAddrKey = useRef("");
  useEffect(() => {
    if (!companyForm) return;
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
        if (!c) return c;
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
  }, [companyForm?.billingAddressPostal, companyForm?.billingAddressStreet]);

  const shellClass = `portal-theme${isLight ? " light" : ""} portal-shell relative h-screen overflow-hidden bg-background text-foreground`;

  if (isLoading || !client || !companyForm || !bankForm) {
    return (
      <div className={`${shellClass} flex items-center justify-center`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const updateCompany = <K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) => {
    setCompanyForm((c) => (c ? { ...c, [key]: value } : c));
    setCompanyErrors((e) => clearError(e, key));
  };
  const updateBank = <K extends keyof BankFormState>(key: K, value: BankFormState[K]) => {
    setBankForm((b) => (b ? { ...b, [key]: value } : b));
    setBankErrors((e) => clearError(e, key));
  };

  const laterAfmaken = () => {
    sessionStorage.setItem("portal-onboarding-snoozed", "1");
    navigate("/portal");
  };

  const validateStepFields = (fields: Array<keyof CompanyFormState>): boolean => {
    const errs = pickErrors(validateCompanyForm(companyForm), fields);
    if (Object.keys(errs).length) {
      setCompanyErrors(errs);
      const firstKey = fields.find((f) => errs[f]);
      toast.error((firstKey && errs[firstKey]) || "Controleer de gemarkeerde velden");
      return false;
    }
    return true;
  };

  const saveCompany = async (): Promise<boolean> => {
    const errs = validateCompanyForm(companyForm);
    if (Object.keys(errs).length) {
      setCompanyErrors(errs);
      const firstKey = Object.keys(errs)[0] as keyof CompanyFormState;
      const target = FIELD_STEP[firstKey];
      if (target) setStep(target);
      toast.error(errs[firstKey] ?? "Controleer uw gegevens");
      return false;
    }
    setSaving(true);
    try {
      const n = normalizeCompanyForm(companyForm);
      await updatePortalCompanyDetails({ ...n, vatStatus: n.vatStatus === "" ? null : n.vatStatus });
      await queryClient.invalidateQueries({ queryKey: ["client-profile"] });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gegevens opslaan mislukt";
      setCompanyErrors(applyCompanyServerError(msg));
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveBank = async (): Promise<boolean> => {
    // Al opgeslagen en niets nieuws ingevuld → overslaan.
    if (bankAlreadySaved && !bankForm.payoutIban.trim()) return true;
    // Eerste keer = geen wachtwoord; een bestaande rekening wijzigen = step-up (wachtwoord vereist).
    const requirePassword = bankAlreadySaved;
    const errs = validateBankForm(bankForm, requirePassword);
    const fields: Array<keyof BankFormState> = [...BANK_REQUIRED_FIELDS, "payoutBic"];
    if (requirePassword) fields.push("currentPassword");
    const bad = firstError(fields, errs);
    if (bad) {
      setBankErrors(errs);
      toast.error(errs[bad] ?? "Controleer de bankgegevens");
      return false;
    }
    setSaving(true);
    try {
      await updatePortalBankDetails(normalizeBankForm(bankForm));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["client-payment-details", client.id] }),
      ]);
      setBankForm((b) => (b ? { ...b, payoutIban: "", currentPassword: "" } : b));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bankgegevens opslaan mislukt";
      if (err instanceof PortalFieldError && err.field) setBankErrors({ [err.field]: msg } as BankErrors);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      await completePortalOnboarding();
      // Zet de snooze zodat een nog niet-verse profielread PortalHome niet terug naar de wizard stuurt;
      // zodra onboarding_completed_at ververst is, is de gate sowieso voldaan.
      sessionStorage.setItem("portal-onboarding-snoozed", "1");
      await queryClient.invalidateQueries({ queryKey: ["client-profile"] });
      toast.success("Uw aanmelding is compleet");
      navigate("/portal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Afronden mislukt");
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    if (step === 0) return setStep(1);
    if (step === 1) return validateStepFields(CONTACT_FIELDS) && setStep(2);
    if (step === 2) return validateStepFields(COMPANY_FIELDS) && setStep(3);
    if (step === 3) return validateStepFields(INVOICE_FIELDS) && setStep(4);
    if (step === 4) return (await saveCompany()) && setStep(5);
    if (step === 5) return (await saveBank()) && setStep(6);
    if (step === 6) return finish();
  };

  const isParticulier = companyForm.vatStatus === "private";

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4 text-center">
            <p className="cockpit-section-label text-primary">Welkom bij E-Charging</p>
            <h2 className="text-xl font-semibold text-foreground">Laten we uw account instellen</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
              We nemen u in een paar korte stappen mee door uw gegevens. Zo kan E-Charging uw laadpunten
              koppelen en uw afrekeningen netjes verwerken. Houd uw KvK- en BTW-nummer (als bedrijf) en uw IBAN
              bij de hand.
            </p>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <StepHeader step={2} title="Contactgegevens" subtitle="Wie is de contactpersoon voor E-Charging?" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="first-name" name="given-name" autoComplete="given-name" label="Voornaam" value={companyForm.contactFirstName} onChange={(v) => updateCompany("contactFirstName", v)} error={companyErrors.contactFirstName} required />
              <Field id="last-name" name="family-name" autoComplete="family-name" label="Achternaam" value={companyForm.contactLastName} onChange={(v) => updateCompany("contactLastName", v)} error={companyErrors.contactLastName} required />
              <Field id="contact-email" name="email" autoComplete="email" label="Contact e-mail" type="email" value={companyForm.contactEmail} onChange={(v) => updateCompany("contactEmail", v)} error={companyErrors.contactEmail} required />
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <CountryCodeField value={companyForm.contactCountryCode} onChange={(v) => updateCompany("contactCountryCode", v)} error={companyErrors.contactCountryCode} />
                <Field id="contact-phone" name="tel-national" autoComplete="tel-national" label="Telefoonnummer" inputMode="tel" placeholder="612345678" value={companyForm.contactPhone} onChange={(v) => updateCompany("contactPhone", v)} error={companyErrors.contactPhone} required />
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <StepHeader step={3} title="Bedrijf en BTW-status" subtitle="Dit bepaalt hoe we uw vergoeding factureren." />
            <VatStatusField value={companyForm.vatStatus} onChange={(v) => updateCompany("vatStatus", v)} error={companyErrors.vatStatus} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="company-name" name="organization" autoComplete="organization" className="sm:col-span-2" label={isParticulier ? "Naam" : "Bedrijfsnaam"} description={invoiceNameHelp(isParticulier)} value={companyForm.companyName} onChange={(v) => updateCompany("companyName", v)} error={companyErrors.companyName} required />
              {!isParticulier && (
                <Field id="kvk" autoComplete="off" label="KvK-nummer" inputMode="numeric" value={companyForm.kvk} onChange={(v) => updateCompany("kvk", v)} error={companyErrors.kvk} required />
              )}
              {companyForm.vatStatus === "vat_liable" && (
                <Field id="btw" autoComplete="off" label="BTW-nummer" placeholder="NL123456789B01" value={companyForm.btwNumber} onChange={(v) => updateCompany("btwNumber", v)} error={companyErrors.btwNumber} required />
              )}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <StepHeader step={4} title="Factuurgegevens" subtitle="Waar sturen we de betaalspecificatie naartoe?" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="billing-street" name="street-address" autoComplete="street-address" className="sm:col-span-3" label={isParticulier ? "Adres" : "Factuuradres"} placeholder="Straat en huisnummer" value={companyForm.billingAddressStreet} onChange={(v) => updateCompany("billingAddressStreet", v)} error={companyErrors.billingAddressStreet} required />
              <Field id="billing-postal" name="postal-code" autoComplete="postal-code" label="Postcode" value={companyForm.billingAddressPostal} onChange={(v) => updateCompany("billingAddressPostal", v)} error={companyErrors.billingAddressPostal} required />
              <Field id="billing-city" name="address-level2" autoComplete="address-level2" className="sm:col-span-2" label="Plaats" value={companyForm.billingAddressCity} onChange={(v) => updateCompany("billingAddressCity", v)} error={companyErrors.billingAddressCity} required />
              <Field id="invoice-email" autoComplete="off" className="sm:col-span-3" label="Factuurmail" type="email" value={companyForm.invoiceEmail} onChange={(v) => updateCompany("invoiceEmail", v)} error={companyErrors.invoiceEmail} required />
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <StepHeader step={5} title="ERE-certificaten" subtitle="Optioneel: geef aan of u ERE's wilt." />
            <EreOptInField checked={companyForm.calculateEreEnabled} onChange={(v) => updateCompany("calculateEreEnabled", v)} />
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <StepHeader step={6} title="Bankgegevens" subtitle="Op deze rekening keren we uw laadopbrengst uit." />
            {bankAlreadySaved && !bankForm.payoutIban.trim() ? (
              <div className="rounded-md border border-border/80 px-3 py-3 text-sm">
                <p className="font-medium text-foreground">Bankgegevens opgeslagen</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  IBAN {paymentDetails?.payout_iban_masked ?? `•••• ${paymentDetails?.payout_iban_last4}`}. Vul hieronder een nieuw IBAN in om te wijzigen.
                </p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="holder" name="payout-account-holder" suppressManagers className="sm:col-span-2" label="Naam rekeninghouder" description={accountHolderHelp(isParticulier)} value={bankForm.payoutAccountHolderName} onChange={(v) => updateBank("payoutAccountHolderName", v)} error={bankErrors.payoutAccountHolderName} required />
              <Field id="iban" name="payout-iban" suppressManagers label="IBAN" placeholder="NL91ABNA0417164300" value={bankForm.payoutIban} onChange={(v) => updateBank("payoutIban", v)} error={bankErrors.payoutIban} required={!bankAlreadySaved} />
              <Field id="bic" name="payout-bic" suppressManagers label="BIC (optioneel)" placeholder="Optioneel" value={bankForm.payoutBic} onChange={(v) => updateBank("payoutBic", v)} error={bankErrors.payoutBic} />
              {/* Step-up: alleen bij het WIJZIGEN van een reeds opgeslagen uitbetaalrekening. Eerste keer: geen wachtwoord. */}
              {bankAlreadySaved && (
                <Field id="bank-password" className="sm:col-span-2" label="Huidig wachtwoord" type="password" autoComplete="current-password" value={bankForm.currentPassword} onChange={(v) => updateBank("currentPassword", v)} error={bankErrors.currentPassword} required />
              )}
            </div>
            {bankAlreadySaved && (
              <p className="text-xs text-muted-foreground">Ter beveiliging bevestigt u uw wachtwoord bij het wijzigen van uw uitbetaalrekening.</p>
            )}
          </div>
        );
      case 6:
        return (
          <div className="space-y-5">
            <StepHeader step={7} title="Zo staan uw gegevens nu" subtitle="Controleer alles en rond uw aanmelding af." />
            <div className="space-y-4">
              <SummaryBlock title="Contactgegevens" onEdit={() => setStep(1)}>
                <InfoItem label="Naam" value={`${companyForm.contactFirstName} ${companyForm.contactLastName}`.trim()} />
                <InfoItem label="E-mail" value={companyForm.contactEmail} />
                <InfoItem label="Telefoon" value={`${companyForm.contactCountryCode} ${companyForm.contactPhone}`.trim()} />
              </SummaryBlock>
              <SummaryBlock title="Bedrijf en BTW" onEdit={() => setStep(2)}>
                <InfoItem label={isParticulier ? "Naam" : "Bedrijfsnaam"} value={companyForm.companyName} />
                <InfoItem label="BTW-status" value={VAT_LABELS[companyForm.vatStatus] ?? "Nog niet gekozen"} />
                {!isParticulier && <InfoItem label="KvK-nummer" value={companyForm.kvk} />}
                {companyForm.vatStatus === "vat_liable" && <InfoItem label="BTW-nummer" value={companyForm.btwNumber} />}
              </SummaryBlock>
              <SummaryBlock title="Factuur" onEdit={() => setStep(3)}>
                <InfoItem label="Factuuradres" value={`${companyForm.billingAddressStreet}, ${companyForm.billingAddressPostal} ${companyForm.billingAddressCity}`} />
                <InfoItem label="Factuurmail" value={companyForm.invoiceEmail} />
              </SummaryBlock>
              <SummaryBlock title="ERE-certificaten" onEdit={() => setStep(4)}>
                <InfoItem label="ERE aangevraagd" value={companyForm.calculateEreEnabled ? "Ja" : "Nee"} />
              </SummaryBlock>
              <SummaryBlock title="Bankgegevens" onEdit={() => setStep(5)}>
                <InfoItem label="Rekeninghouder" value={bankForm.payoutAccountHolderName} />
                <InfoItem label="IBAN" value={paymentDetails?.payout_iban_masked ?? (bankForm.payoutIban ? "Opgeslagen" : null)} />
              </SummaryBlock>
            </div>
            <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground">Wat gebeurt er nu?</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                <li>E-Charging controleert uw gegevens en bevestigt uw BTW-status.</li>
                <li>We koppelen uw laadpunten aan uw klantnummer.</li>
                <li>U ziet uw sessies, geleverde kWh en de maandelijkse afrekening in het portaal.</li>
                {companyForm.calculateEreEnabled && <li>Uw ERE-aanvraag zetten we door zodat we contact met u kunnen opnemen.</li>}
              </ul>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const primaryLabel = step === 0 ? "Beginnen" : step === 6 ? "Afronden" : "Volgende";

  return (
    <div className={shellClass}>
      {/* Binnenlaag: enige directe child van .portal-shell (die z'n children position:relative geeft).
          Zo blijven de absolute kap + footer hierbinnen wél absolute en klopt de centrering. */}
      <div className="relative h-full">
      <ThemeToggle variant="floating" />

      {/* Cockpit-kap bovenaan (signatuur E-Charging) */}
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <CockpitArc className="h-[clamp(90px,15vh,200px)]" />
      </div>

      {/* Vast, gecentreerd scherm — de pagina scrollt niet; alleen een lange stap scrollt in de kaart */}
      <div className="relative z-[1] flex h-full items-center justify-center px-4 py-4">
        <div className="flex max-h-full w-full max-w-xl flex-col animate-fade-in">
          {/* Logo + merk */}
          <div className="flex flex-shrink-0 flex-col items-center">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-3 rounded-2xl bg-gradient-to-br from-primary/25 via-blue-400/10 to-transparent blur-xl" />
              <img src={isLight ? logoFullColor : logoBright} alt="E-Charging" className="relative h-8 w-auto sm:h-9" />
            </div>
            <p className="cockpit-title mt-5">Aanmelden</p>
            <div className="cockpit-title-accent mt-2.5" />
          </div>

          {/* Segment-voortgang */}
          <div className="mb-4 mt-6 flex flex-shrink-0 items-center gap-1.5" aria-hidden>
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  i < step
                    ? "bg-primary"
                    : i === step
                    ? "bg-primary shadow-[0_0_10px_hsl(118_100%_45%/0.6)]"
                    : "bg-border"
                }`}
              />
            ))}
          </div>

          {/* Gloed-kaart — krimpt bij een lange stap; de inhoud scrollt dan intern */}
          <div className="relative flex min-h-0 flex-col">
            <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/30 via-transparent to-blue-400/20" />
            <div
              className="relative flex min-h-0 flex-col rounded-3xl border border-border/60 bg-card/80 backdrop-blur-md"
              style={{ boxShadow: "0 0 60px rgba(5,165,0,0.06), 0 1px 0 rgba(255,255,255,0.04) inset" }}
            >
              <div key={step} className="animate-fade-in overflow-y-auto overscroll-contain p-6 sm:p-8">
                {renderStep()}
              </div>
            </div>
          </div>

          {/* Navigatie */}
          <div className="mt-5 flex flex-shrink-0 items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || saving}
              className={step === 0 ? "invisible" : ""}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Terug
            </Button>
            <Button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="ignition-button h-11 min-w-[9.5rem] text-sm font-semibold uppercase tracking-[0.12em]"
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {primaryLabel}
              {step !== 0 && step !== 6 && !saving ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
              {step === 6 && !saving ? <Check className="ml-1.5 h-4 w-4" /> : null}
            </Button>
          </div>

          {/* Later afmaken */}
          <div className="mt-4 flex-shrink-0 text-center">
            <button
              type="button"
              onClick={laterAfmaken}
              disabled={saving}
              className="text-xs tracking-wide text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
            >
              Later afmaken
            </button>
          </div>
        </div>
      </div>

      {/* Footer onderaan het scherm */}
      <p className="pointer-events-none absolute inset-x-0 bottom-4 select-none text-center text-[10px] uppercase tracking-[0.35em] text-muted-foreground/40">
        E-Charging · onderdeel van E-Group BV
      </p>

      <style>{wizardStyles}</style>
      </div>
    </div>
  );
}

// Energieke groene primaire knop (zelfde recept als het inlogscherm).
const wizardStyles = `
.ignition-button {
  background: linear-gradient(135deg, hsl(118.2 100% 32.4%) 0%, hsl(140 100% 32%) 100%);
  color: white;
  box-shadow: 0 0 0 1px hsl(118 100% 40% / 0.4), 0 8px 24px hsl(118 100% 32% / 0.3);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ignition-button:hover:not(:disabled) {
  background: linear-gradient(135deg, hsl(118 100% 36%) 0%, hsl(140 100% 35%) 100%);
  box-shadow: 0 0 0 1px hsl(118 100% 50% / 0.6), 0 12px 36px hsl(118 100% 32% / 0.45);
  transform: translateY(-1px);
}
.ignition-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 0 0 1px hsl(118 100% 40% / 0.4), 0 4px 12px hsl(118 100% 32% / 0.3);
}
.ignition-button:disabled { opacity: 0.7; cursor: not-allowed; }
`;

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <p className="cockpit-section-label">Stap {step} van 7</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SummaryBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/20 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-primary underline-offset-4 transition hover:underline">
          Wijzigen
        </button>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}
