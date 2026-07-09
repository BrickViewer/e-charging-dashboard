import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Eén rasterregel van het calculatieblad. Élk rijtype gebruikt dit grid —
 * artikelregel, parameterregel, sectiekop, stelpost — want dat is de enige
 * manier om zonder <table> alle bedragen op dezelfde rechterrand te krijgen.
 *
 * `minmax(0,1fr)` op de naamkolom is dragend: met een kale `1fr` kan de track
 * niet onder zijn contentbreedte krimpen, en blaast een lange artikelnaam de
 * layout op (truncate werkt dan nooit).
 *
 * De actiekolom is altijd gereserveerd, ook als de knop verborgen is — anders
 * verspringt het bedrag zodra je over een regel hovert.
 */
export const ROW_GRID = "grid grid-cols-[1.25rem_3rem_minmax(0,1fr)_6rem_1.75rem] items-start gap-x-2 px-3";

export function CalcRow({
  chevron,
  qty,
  main,
  amount,
  action,
  className,
  testId,
}: {
  chevron?: ReactNode;
  qty?: ReactNode;
  main: ReactNode;
  amount?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn(ROW_GRID, className)} data-testid={testId}>
      <div className="flex h-8 items-center justify-center">{chevron}</div>
      <div className="flex h-8 items-center">{qty}</div>
      <div className="min-w-0 py-0.5">{main}</div>
      <div className="flex h-8 items-center justify-end text-right tabular-nums">{amount}</div>
      <div className="flex h-8 items-center justify-end">{action}</div>
    </div>
  );
}
