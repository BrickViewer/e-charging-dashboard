import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { NavIconBar } from "@/components/portal/NavIconBar";
import { CockpitArc } from "@/components/portal/CockpitArc";
import { ThemeToggle } from "@/components/portal/ThemeToggle";
import { StartConfiguratorButton } from "@/components/portal/StartConfiguratorButton";
import { usePortalTheme } from "@/hooks/usePortalTheme";
import { useDemoMode } from "@/contexts/demoModeContextValue";

// Titels op sub-pad, zodat ze zowel onder /portal als /demo werken.
const TITLES: Record<string, string> = {
  sessies: "Sessies",
  financieel: "Financieel",
  gegevens: "Mijn gegevens",
  onboarding: "Financieel",
  berichten: "Berichten",
};

function getTitle(pathname: string, base: string): string | null {
  if (pathname === base || pathname === `${base}/`) return null;
  const sub = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  if (TITLES[sub]) return TITLES[sub];
  if (sub.startsWith("locatie/")) return "Locatie";
  return null;
}

export default function ClientLayout() {
  const { pathname } = useLocation();
  const { isLight } = usePortalTheme();
  const isDemo = useDemoMode();
  const base = isDemo ? "/demo" : "/portal";
  const isDashboard = pathname === base || pathname === `${base}/`;
  const title = getTitle(pathname, base);

  // Sync de thema-klassen naar <html> zodat Radix-portals (Select, Tooltip —
  // gerenderd in document.body, búiten deze div) dezelfde tokens krijgen.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("portal-theme");
    root.classList.toggle("light", isLight);
    return () => root.classList.remove("portal-theme", "light");
  }, [isLight]);

  const shellClass = `portal-theme${isLight ? " light" : ""} portal-shell h-screen overflow-hidden flex flex-col bg-background text-foreground`;

  if (isDashboard) {
    return (
      <div className={shellClass}>
        <ThemeToggle variant="floating" />
        {isDemo && (
          <div className="portal-demo-actions">
            <StartConfiguratorButton />
            <span className="portal-demo-chip" aria-label="Demo-omgeving">Demo</span>
          </div>
        )}
        <div className="flex-shrink-0 w-full pt-0">
          <CockpitArc className="h-[clamp(80px,14vh,240px)]" />
        </div>
        <div className="portal-fixed-nav">
          <NavIconBar />
        </div>
        <main className="flex-1 min-h-0 w-full px-4 lg:px-12 pt-1 pb-24 lg:pb-2 overflow-hidden overscroll-none">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <ThemeToggle variant="floating" />
        {isDemo && (
          <div className="portal-demo-actions">
            <StartConfiguratorButton />
            <span className="portal-demo-chip" aria-label="Demo-omgeving">Demo</span>
          </div>
        )}
      {/* Eén scroll-container — content schuift onder de cockpit-arc door, volgt zo de curve */}
      <div className="flex-1 min-h-0 w-full overflow-y-auto">
        {/* Sticky cockpit-arc met overlay-titel. h-0 op de sticky-wrapper zodat de inhoud
            niet als layout-ruimte telt, maar visueel altijd bovenaan blijft. */}
        <div className="sticky top-0 z-20 w-full h-0 pointer-events-none">
          <div className="relative h-[clamp(80px,14vh,240px)]">
            <CockpitArc className="absolute inset-0 w-full h-full" />
            {title && (
              <div className="absolute inset-x-0 top-[clamp(20px,4.2vh,72px)] flex justify-center px-4">
                <h1 className="cockpit-title">{title}</h1>
              </div>
            )}
          </div>
        </div>

        <div className="portal-fixed-nav">
          <NavIconBar />
          <Link to={base} className="portal-back-link" aria-label="Terug naar dashboard">
            ←
          </Link>
        </div>

        {/* Content area — start direct onder de cockpit-arc (padding compenseert de h-0 sticky) */}
        <div className="relative pt-[clamp(80px,14vh,240px)]">
          <div className="max-w-5xl mx-auto px-4 lg:px-8 lg:pl-24 xl:pl-8 pt-4 pb-28 md:pb-10">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
