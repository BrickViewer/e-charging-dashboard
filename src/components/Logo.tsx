interface LogoProps {
  variant?: "light" | "dark";
  subtitle?: string;
}

export function Logo({ variant = "light", subtitle }: LogoProps) {
  const isDark = variant === "dark";

  return (
    <div>
      <div className="text-lg font-semibold leading-tight">
        <span className="text-primary" style={{ color: '#047F00' }}>e-</span>
        <span className={isDark ? "text-white" : "text-foreground"}>Charging</span>
      </div>
      {subtitle && (
        <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
