import logoFullColor from "@/assets/logo-full-color.svg";
import logoBright from "@/assets/logo-bright.svg";

interface LogoProps {
  variant?: "light" | "dark";
  subtitle?: string;
  className?: string;
}

export function Logo({ variant = "light", subtitle, className }: LogoProps) {
  const src = variant === "dark" ? logoBright : logoFullColor;

  return (
    <div className={className}>
      <img src={src} alt="e-Charging" className="h-10 w-auto" />
      {subtitle && (
        <span className={`text-xs font-medium mt-0.5 block ${variant === "dark" ? "text-gray-400" : "text-muted-foreground"}`}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
