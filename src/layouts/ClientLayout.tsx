import { Outlet, useLocation } from "react-router-dom";
import { NavIconBar } from "@/components/portal/NavIconBar";
import { CockpitArc } from "@/components/portal/CockpitArc";

const TITLES: Record<string, string> = {
  "/portal/sessies": "Sessies",
  "/portal/financieel": "Financieel",
  "/portal/gegevens": "Mijn gegevens",
  "/portal/berichten": "Berichten",
};

function getTitle(pathname: string): string | null {
  if (pathname === "/portal" || pathname === "/portal/") return null;
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith("/portal/locatie/")) return "Locatie";
  return null;
}

export default function ClientLayout() {
  const { pathname } = useLocation();
  const isDashboard = pathname === "/portal" || pathname === "/portal/";
  const title = getTitle(pathname);

  if (isDashboard) {
    return (
      <div className="portal-theme h-screen overflow-hidden flex flex-col bg-background text-foreground">
        <div className="flex-shrink-0 w-full pt-0">
          <CockpitArc className="h-[clamp(80px,14vh,240px)]" />
        </div>
        <main className="flex-1 min-h-0 w-full px-4 lg:px-12 pt-1 pb-2 overflow-y-auto">
          <Outlet />
        </main>
        <div className="flex-shrink-0 w-full px-4 pt-3 pb-4">
          <NavIconBar />
        </div>
      </div>
    );
  }

  return (
    <div className="portal-theme h-screen overflow-hidden flex flex-col bg-background text-foreground">
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

        {/* Content area — start direct onder de cockpit-arc (padding compenseert de h-0 sticky) */}
        <div className="relative pt-[clamp(80px,14vh,240px)]">
          <div className="max-w-5xl mx-auto px-4 lg:px-8 pt-4 pb-10">
            <Outlet />
          </div>
        </div>
      </div>

      {/* Nav-iconen onderaan */}
      <div className="flex-shrink-0 w-full px-4 pt-3 pb-4">
        <NavIconBar />
      </div>
    </div>
  );
}
