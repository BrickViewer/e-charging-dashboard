import { useRef } from "react";
import { CalendarPlus } from "lucide-react";
import { Input } from "@/components/ui/input";

// Inline datumveld voor taakrijen. Leeg veld toont GEEN native "dd-mm-jjjj"-placeholder
// (oogt rommelig in een lijst) maar een subtiel kalender-knopje dat op hover van de rij
// verschijnt en via showPicker() direct de native datumkiezer opent.
export function InlineDueDate({
  value,
  onChange,
  overdue = false,
  className = "",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  overdue?: boolean;
  className?: string;
}) {
  const hiddenRef = useRef<HTMLInputElement>(null);

  if (!value) {
    return (
      <span className="relative flex items-center">
        <input
          ref={hiddenRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        />
        <button
          type="button"
          className="rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => {
            const el = hiddenRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.focus();
          }}
          aria-label="Vervaldatum kiezen"
          title="Vervaldatum kiezen"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <Input
      type="date"
      value={value.slice(0, 10)}
      onChange={(e) => onChange(e.target.value || null)}
      className={`h-7 w-[125px] border-0 bg-transparent px-1 text-[11px] tabular-nums shadow-none focus-visible:ring-1 ${overdue ? "font-medium text-red-600" : "text-muted-foreground"} ${className}`}
      aria-label="Vervaldatum"
    />
  );
}
