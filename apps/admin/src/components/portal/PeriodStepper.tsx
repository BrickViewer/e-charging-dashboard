import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Strakke, lineaire periode-navigatie: < label > waarmee je per stap door een
// chronologische lijst loopt (per jaar: "Heel {jaar}" gevolgd door de maanden).
// Eén control om doorheen te klikken; geen wrappende pill-rij meer.
interface PeriodStepperProps {
  label: string;          // label van de huidige selectie (bv. "mei 2026" of "Heel 2026")
  index: number;          // huidige positie in de lijst
  count: number;          // totaal aantal stops
  onIndexChange: (next: number) => void;
}

export function PeriodStepper({ label, index, count, onIndexChange }: PeriodStepperProps) {
  const canPrev = index > 0;
  const canNext = index < count - 1;

  const step = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < count) onIndexChange(next);
  };

  return (
    <div className="flex items-center justify-center gap-2 select-none">
      <button
        type="button"
        aria-label="Vorige periode"
        onClick={() => step(-1)}
        disabled={!canPrev}
        className={cn(
          // Mobiel 44px tapzone (touch-norm); desktop de compacte 32px van het ontwerp
          "w-11 h-11 lg:w-8 lg:h-8 rounded-full flex items-center justify-center transition-colors",
          canPrev
            ? "text-muted-foreground hover:text-foreground hover:bg-card/80 active:scale-95"
            : "text-muted-foreground/25 cursor-not-allowed"
        )}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <span
        className="min-w-[104px] lg:min-w-[140px] text-center text-sm font-medium uppercase tracking-[0.14em] text-foreground/90 tabular-nums"
        aria-live="polite"
      >
        {label}
      </span>

      <button
        type="button"
        aria-label="Volgende periode"
        onClick={() => step(1)}
        disabled={!canNext}
        className={cn(
          "w-11 h-11 lg:w-8 lg:h-8 rounded-full flex items-center justify-center transition-colors",
          canNext
            ? "text-muted-foreground hover:text-foreground hover:bg-card/80 active:scale-95"
            : "text-muted-foreground/25 cursor-not-allowed"
        )}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
