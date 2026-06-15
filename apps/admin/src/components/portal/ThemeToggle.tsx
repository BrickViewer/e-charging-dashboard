// Dag/nacht-toggle voor het klantenportaal. Zelfvoorzienend via usePortalTheme.
// Twee varianten: "floating" (glazen chip rechtsboven, zie .portal-theme-toggle
// in index.css) en "menu" (full-width rij, voor een evt. instellingenpagina).
import { Sun, Moon } from "lucide-react";
import { usePortalTheme } from "@/hooks/usePortalTheme";

interface ThemeToggleProps {
  variant?: "floating" | "menu";
}

export function ThemeToggle({ variant = "menu" }: ThemeToggleProps) {
  const { isLight, toggle } = usePortalTheme();
  const label = isLight ? "Nachtmodus" : "Dagmodus";

  if (variant === "floating") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="portal-theme-toggle"
        aria-pressed={isLight}
        aria-label={label}
        title={label}
      >
        {/* Gestapelde iconen voor een zachte crossfade/rotatie bij het wisselen */}
        <span className="relative inline-flex h-[1.05rem] w-[1.05rem]">
          <Sun
            className={`absolute inset-0 h-full w-full transition-all duration-300 ease-out ${
              isLight ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
            }`}
            strokeWidth={1.5}
          />
          <Moon
            className={`absolute inset-0 h-full w-full transition-all duration-300 ease-out ${
              isLight ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"
            }`}
            strokeWidth={1.5}
          />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
      aria-pressed={isLight}
      aria-label={label}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      <span>{label}</span>
    </button>
  );
}
