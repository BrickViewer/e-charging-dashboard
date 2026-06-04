import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  isLight: boolean;
  onToggle: () => void;
}

export function ThemeToggle({ isLight, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
      aria-label={isLight ? "Donker thema" : "Licht thema"}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      <span>{isLight ? "Donker thema" : "Licht thema"}</span>
    </button>
  );
}
