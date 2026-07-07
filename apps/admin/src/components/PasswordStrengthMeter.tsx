// Wachtwoordsterkte-hook + balkje, gedeeld door activatie/herstel/wijzigen.
// De hook is de bron van waarheid: de parent gebruikt `result.ok` om opslaan te blokkeren
// én geeft `result` door aan de presentational meter (zo evalueren we maar één keer).

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { evaluatePassword, type PasswordEvaluation } from "@/lib/passwordStrength";

const EMPTY: PasswordEvaluation = { score: 0, ok: false, labelNl: "" };

export function usePasswordStrength(password: string, userInputs: (string | number)[] = []) {
  const [result, setResult] = useState<PasswordEvaluation>(EMPTY);
  const [loading, setLoading] = useState(false);
  // Stabiele key voor de dependency (voorkomt herevaluatie bij een nieuwe array-referentie).
  const inputsKey = userInputs.map((v) => String(v)).filter((s) => s.length > 0).join("");
  const latest = useRef(0);

  useEffect(() => {
    if (!password) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++latest.current;
    const handle = setTimeout(() => {
      evaluatePassword(password, inputsKey ? inputsKey.split("") : []).then((res) => {
        if (id === latest.current) {
          setResult(res);
          setLoading(false);
        }
      });
    }, 180);
    return () => clearTimeout(handle);
  }, [password, inputsKey]);

  return { result, loading };
}

// Kleur per score-emmertje: 0-1 rood, 2 amber, 3-4 groen.
function scoreColor(score: number) {
  if (score >= 3) return "bg-primary";
  if (score === 2) return "bg-[hsl(var(--status-amber))]";
  return "bg-destructive";
}

function scoreTextColor(score: number) {
  if (score >= 3) return "text-primary";
  if (score === 2) return "text-[hsl(var(--status-amber))]";
  return "text-destructive";
}

export function PasswordStrengthMeter({
  result,
  loading,
  className,
}: {
  result: PasswordEvaluation;
  loading?: boolean;
  className?: string;
}) {
  if (!result.labelNl && !loading) return null;
  const filled = Math.max(1, result.score); // weak → toon minimaal 1 segment
  return (
    <div className={cn("mt-2", className)} aria-live="polite">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < filled ? scoreColor(result.score) : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed">
        <span className={cn("font-medium", scoreTextColor(result.score))}>{result.labelNl}</span>
        {result.warningNl && <span className="text-muted-foreground"> — {result.warningNl}</span>}
      </p>
    </div>
  );
}
