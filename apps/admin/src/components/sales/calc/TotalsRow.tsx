import { cn } from "@/lib/utils";

/**
 * Eén label-waarde-regel in de kaarten naast het calculatieblad.
 *
 * `accent` geeft de standaard-accentkleur. Wil je een andere kleur (de
 * marge-kaart kleurt een negatieve marge rood), gebruik dan `valueClassName` —
 * die wordt als laatste toegepast en wint dus. De kleurbeslissing hoort bij de
 * kaart die de betekenis kent, niet bij de rij.
 */
export function TotalsRow({
  label,
  value,
  muted,
  strong,
  accent,
  valueClassName,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  accent?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn(muted && "text-muted-foreground", strong && "font-semibold")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "text-base font-semibold",
          accent && "font-medium text-primary",
          muted && "text-muted-foreground",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}
