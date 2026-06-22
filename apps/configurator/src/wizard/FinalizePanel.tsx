import type { PricingInput } from "@echarging/pricing-engine";
import { Check, X, MonitorPlay } from "lucide-react";

// Admin-app origin voor de demo-deeplink. In dev draait admin op 8080.
const ADMIN_URL = (import.meta.env.VITE_ADMIN_APP_URL as string | undefined)
  ?? (import.meta.env.DEV ? "http://localhost:8080" : "https://dashboard.e-charging.nl");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function FinalizePanel({
  input,
  updateInput,
  summary,
  onFinalize,
  finalizing,
  finalizeError,
  leadMode,
  savedToLead,
  demoCfg,
  onClose,
}: {
  input: PricingInput;
  updateInput: (recipe: (draft: PricingInput) => void) => void;
  summary: { label: string; value: string }[];
  onFinalize: () => void;
  finalizing: boolean;
  finalizeError: string | null;
  leadMode?: boolean;
  savedToLead?: boolean;
  demoCfg?: string | null;
  onClose: () => void;
}) {
  const emailRaw = input.customer.contactEmail.trim();
  const emailValid = emailRaw === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  const canSubmit = !finalizing && input.customer.companyName.trim().length > 0 && emailValid;

  const openDemo = () => {
    if (!demoCfg) return;
    // No-login demo: de config zit in de link, dus geen login/DB nodig.
    window.open(
      `${ADMIN_URL}/demo?cfg=${demoCfg}`,
      "_blank",
      "noopener,noreferrer,width=1400,height=900",
    );
  };

  return (
    <>
      <div className="slideover-backdrop" onClick={onClose} />
      <aside className="slideover-panel" role="dialog" aria-label="Opslaan">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">Opslaan</h2>
          <button type="button" onClick={onClose} aria-label="Sluiten"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card-soft hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {savedToLead ? (
          <div className="mt-10 space-y-4 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gauge-green/15 text-gauge-green">
              <Check size={32} />
            </div>
            <p className="text-lg font-bold text-foreground">Opgeslagen aan de lead</p>
            <p className="text-sm text-muted-foreground">
              De configuratie staat nu op de lead. Vanuit de lead stel je hiermee de offerte op; de klant wordt aangemaakt zodra de offerte wordt geaccepteerd.
            </p>
            {demoCfg && (
              <div className="space-y-2 pt-2">
                <button type="button" className="primary-button w-full inline-flex items-center justify-center gap-2" onClick={openDemo}>
                  <MonitorPlay size={18} />
                  Demo openen met deze gegevens
                </button>
                <p className="text-xs text-muted-foreground">
                  Een live dashboard met exact deze configuratie, zonder login, om aan de klant te laten zien.
                </p>
              </div>
            )}
            <button type="button" className="secondary-button w-full" onClick={onClose}>Sluiten</button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {leadMode
                ? "Sla de configuratie op aan de lead. Je kunt later verder bewerken; de klant wordt aangemaakt zodra de offerte wordt geaccepteerd."
                : "Sla de configuratie op. Er wordt een lead aangemaakt met deze gegevens; de klant ontstaat pas zodra de offerte wordt geaccepteerd."}
            </p>

            <div className="mt-5 rounded-2xl border border-border-soft/70 p-4">
              <p className="field-label mb-3">Vastgelegde configuratie</p>
              <div className="space-y-1.5">
                {summary.map((s) => (
                  <div key={s.label} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="mono text-right text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Bedrijfsnaam *">
                <input className="text-input" value={input.customer.companyName}
                  onChange={(e) => updateInput((d) => { d.customer.companyName = e.target.value; })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contactpersoon">
                  <input className="text-input" value={input.customer.contactName}
                    onChange={(e) => updateInput((d) => { d.customer.contactName = e.target.value; })} />
                </Field>
                <Field label="Telefoon">
                  <input className="text-input" value={input.customer.contactPhone}
                    onChange={(e) => updateInput((d) => { d.customer.contactPhone = e.target.value; })} />
                </Field>
              </div>
              <Field label="E-mail">
                <input className="text-input" type="email" value={input.customer.contactEmail}
                  onChange={(e) => updateInput((d) => { d.customer.contactEmail = e.target.value; })} />
              </Field>
              {emailRaw !== "" && !emailValid && (
                <p className="-mt-2 text-xs font-medium text-gauge-red">Vul een geldig e-mailadres in.</p>
              )}
              <Field label="Straat en huisnummer">
                <input className="text-input" value={input.customer.locationAddress}
                  onChange={(e) => updateInput((d) => { d.customer.locationAddress = e.target.value; })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Postcode">
                  <input className="text-input" value={input.customer.postalCode}
                    onChange={(e) => updateInput((d) => { d.customer.postalCode = e.target.value; })} />
                </Field>
                <Field label="Plaats">
                  <input className="text-input" value={input.customer.city}
                    onChange={(e) => updateInput((d) => { d.customer.city = e.target.value; })} />
                </Field>
              </div>
            </div>

            {finalizeError && (
              <p className="mt-5 rounded-xl border border-gauge-red/40 bg-gauge-red/10 p-3 text-sm font-semibold text-gauge-red">
                {finalizeError}
              </p>
            )}

            <button type="button" className="primary-button mt-6 w-full" disabled={!canSubmit} onClick={onFinalize}>
              {finalizing ? "Bezig met opslaan…" : "Opslaan"}
            </button>
            {!input.customer.companyName.trim() && (
              <p className="mt-2 text-center text-xs text-muted-foreground">Vul een bedrijfsnaam in om op te slaan.</p>
            )}
          </>
        )}
      </aside>
    </>
  );
}
