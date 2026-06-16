import { useEffect, type ReactNode } from "react";
import { ThemeToggle } from "@/components/portal/ThemeToggle";
import { usePortalTheme } from "@/hooks/usePortalTheme";

// Volledig-scherm portal-themed wrapper voor demo-schermen zonder de portal-
// chrome (keuzescherm, laden, fout). Zelfde thema-sync als ClientLayout.
export function DemoShell({ children }: { children: ReactNode }) {
  const { isLight } = usePortalTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("portal-theme");
    root.classList.toggle("light", isLight);
    return () => root.classList.remove("portal-theme", "light");
  }, [isLight]);

  return (
    <div className={`portal-theme${isLight ? " light" : ""} portal-shell min-h-screen flex flex-col bg-background text-foreground`}>
      <ThemeToggle variant="floating" />
      <span className="portal-demo-chip" aria-label="Demo-omgeving">Demo</span>
      {children}
    </div>
  );
}
