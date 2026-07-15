// Herbruikbare portaal-veldcomponenten voor de onboarding-wizard (en potentieel het
// "Mijn gegevens"-formulier). De ERE-/BTW-copy komt uit lib/portalProfile zodat er geen drift ontstaat.

import { useId, useState, type HTMLAttributes } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ERE_HELP, ERE_OPTIN_DISCLAIMER, type VatStatusChoice } from "@/lib/portalProfile";

export function clearError<T extends string>(errors: Partial<Record<T, string>>, key: T) {
  if (!errors[key]) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

export function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value || "Niet ingevuld"}</dd>
    </div>
  );
}

export function Field({
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
  idPrefix = "onboarding",
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
  // `name` helpt de browser het veld correct te herkennen voor autofill.
  name?: string;
  // Optionele hulptekst onder het label (bv. "deze naam komt op de factuur").
  description?: string;
  // Onderdruk autofill + wachtwoordmanagers (IBAN/BIC/rekeninghouder): geen adres/naam in IBAN.
  suppressManagers?: boolean;
  idPrefix?: string;
}) {
  const inputId = `${idPrefix}-${id}`;
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

export function CountryCodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const inputId = "onboarding-landcode";
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

// BTW-status via twee FEITENVRAGEN i.p.v. een conclusie (commissionairs-handboek p.4:
// "vraag naar feiten, niet naar een conclusie"). De klant weet niet zelf of hij een
// self-billing factuur of een betaalspecificatie hoort te krijgen — dat leiden wij af:
//   geen btw-nummer            → private (betaalspecificatie, geen ondernemer)
//   btw-nummer + KOR            → kor     (betaalspecificatie, KOR van toepassing)
//   btw-nummer, geen KOR        → vat_liable (self-billing factuur, 21%)
// Het externe contract blijft een VatStatusChoice, zodat wizard/gegevensformulier
// ongewijzigd blijven. Tussenstand (btw=ja, KOR nog niet beantwoord) → "" (onvolledig).
export function VatStatusField({
  value,
  onChange,
  error,
}: {
  value: VatStatusChoice;
  onChange: (value: VatStatusChoice) => void;
  error?: string;
}) {
  const deriveHasBtw = (v: VatStatusChoice): "yes" | "no" | "" =>
    v === "vat_liable" || v === "kor" ? "yes" : v === "private" ? "no" : "";
  const [hasBtw, setHasBtw] = useState<"yes" | "no" | "">(() => deriveHasBtw(value));
  const kor: "yes" | "no" | "" = value === "kor" ? "yes" : value === "vat_liable" ? "no" : "";

  const onBtwChange = (v: string) => {
    setHasBtw(v as "yes" | "no");
    if (v === "no") onChange("private");
    // btw-nummer → wacht op het KOR-antwoord voordat de status vaststaat.
    else onChange(value === "kor" || value === "vat_liable" ? value : "");
  };
  const onKorChange = (v: string) => onChange(v === "yes" ? "kor" : "vat_liable");

  return (
    <div className="space-y-3 rounded-md border border-border/80 px-3 py-3">
      <div className="space-y-2">
        <Label className="text-sm text-foreground">
          Heeft u een btw-nummer? <span className="text-destructive">*</span>
        </Label>
        <RadioGroup value={hasBtw} onValueChange={onBtwChange} className="gap-2.5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <RadioGroupItem value="yes" className="mt-0.5" />
            <span className="text-sm">
              Ja, ik heb een btw-nummer
              <span className="block text-xs text-muted-foreground">U bent ondernemer voor de omzetbelasting</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <RadioGroupItem value="no" className="mt-0.5" />
            <span className="text-sm">
              Nee, ik heb geen btw-nummer
              <span className="block text-xs text-muted-foreground">U ontvangt het geld als particulier; geen KvK- of BTW-nummer nodig</span>
            </span>
          </label>
        </RadioGroup>
      </div>

      {hasBtw === "yes" && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-sm text-foreground">
            Past u de kleineondernemersregeling (KOR) toe? <span className="text-destructive">*</span>
          </Label>
          <RadioGroup value={kor} onValueChange={onKorChange} className="gap-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <RadioGroupItem value="no" className="mt-0.5" />
              <span className="text-sm">
                Nee, ik reken btw
                <span className="block text-xs text-muted-foreground">21% BTW; KvK- en BTW-nummer verplicht</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <RadioGroupItem value="yes" className="mt-0.5" />
              <span className="text-sm">
                Ja, ik pas de KOR toe
                <span className="block text-xs text-muted-foreground">Geen BTW; KvK-nummer verplicht</span>
              </span>
            </label>
          </RadioGroup>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EreOptInField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/80 px-3 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="onboarding-ere" className="text-sm text-foreground">
            Bereken mijn ERE's
          </Label>
          <p className="text-xs text-muted-foreground">{ERE_HELP}</p>
        </div>
        <Switch id="onboarding-ere" checked={checked} onCheckedChange={onChange} />
      </div>
      <p className="text-xs text-[hsl(var(--status-amber))]">{ERE_OPTIN_DISCLAIMER}</p>
    </div>
  );
}
