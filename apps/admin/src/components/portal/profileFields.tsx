// Herbruikbare portaal-veldcomponenten voor de onboarding-wizard (en potentieel het
// "Mijn gegevens"-formulier). De ERE-/BTW-copy komt uit lib/portalProfile zodat er geen drift ontstaat.

import type { HTMLAttributes } from "react";

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
  const resolvedAutoComplete = suppressManagers ? "off" : autoComplete;
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
        name={name}
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

export function VatStatusField({
  value,
  onChange,
  error,
}: {
  value: VatStatusChoice;
  onChange: (value: VatStatusChoice) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/80 px-3 py-3">
      <Label className="text-sm text-foreground">
        BTW-status <span className="text-destructive">*</span>
      </Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as VatStatusChoice)} className="gap-2.5">
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
