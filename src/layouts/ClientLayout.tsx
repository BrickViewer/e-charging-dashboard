import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { LogOut, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NavIconBar } from "@/components/portal/NavIconBar";
import { CockpitArc } from "@/components/portal/CockpitArc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const THEME_KEY = "portal-theme-mode";

export default function ClientLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isLight, setIsLight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(THEME_KEY) === "light";
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
  }, [isLight]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const themeClass = `portal-theme ${isLight ? "light" : ""}`;
  const logoVariant = isLight ? "light" : "dark";

  return (
    <div className={`${themeClass} min-h-screen bg-background text-foreground`}>
      {/* Top-bar: logo links, acties rechts */}
      <header className="flex items-center justify-between px-6 lg:px-10 pt-5 pb-1">
        <Link to="/portal" aria-label="Terug naar dashboard" className="inline-flex">
          <Logo variant={logoVariant} />
        </Link>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsLight(v => !v)}
                aria-label={isLight ? "Donker thema" : "Licht thema"}
              >
                {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isLight ? "Donker thema" : "Licht thema"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                aria-label="Uitloggen"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Uitloggen</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Cockpit-frame: arc + navigatie-iconen, gecentreerd, zichtbaar op elke portal-pagina */}
      <div className="relative max-w-5xl mx-auto px-4 mt-4">
        <CockpitArc className="absolute -top-2 left-0 right-0 h-20 sm:h-24" />
        <div className="pt-7 relative z-10">
          <NavIconBar />
        </div>
      </div>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-4 lg:px-10 pt-10 pb-12">
        <Outlet />
      </main>
    </div>
  );
}
