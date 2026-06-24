import { SCOPES, SCOPE_LABEL, SCOPE_HINT, scopeFromFlags, flagsFromScope, type QuoteScope } from "@/lib/quoteScope";

// 3-weg scope-keuze voor een offerte/klant: Installatie+beheer | Alleen installatie | Alleen beheer.
export function ScopeSelector({
  withInstallation, withManagement, onChange, disabled,
}: {
  withInstallation: boolean;
  withManagement: boolean;
  onChange: (flags: { withInstallation: boolean; withManagement: boolean }) => void;
  disabled?: boolean;
}) {
  const active = scopeFromFlags(withInstallation, withManagement);
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-medium text-foreground">Scope</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {SCOPES.map((s: QuoteScope) => {
          const on = active === s;
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange(flagsFromScope(s))}
              className={`rounded-lg border p-2 text-left transition-colors disabled:opacity-50 ${on ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}
            >
              <span className={`block text-xs font-semibold ${on ? "text-primary" : "text-foreground"}`}>{SCOPE_LABEL[s]}</span>
              <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{SCOPE_HINT[s]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
