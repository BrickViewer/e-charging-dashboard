// Skelet van het mobiele portaal-dashboard: zelfde verticale opbouw als
// ClientDashboard (selector-/statusrij → carrouselzone → dots), met de
// boot-gauge exact op de plek van de grote XL-meter. Gebruikt door de
// login-splash én de laadstates van het portaal, zodat inloggen zonder
// geknipper overvloeit in het dashboard.
import { CockpitGaugeBoot } from "./CockpitGauge";
import { usePortalTheme } from "@/hooks/usePortalTheme";
import iconBright from "@/assets/icon-bright.svg";
import iconFullColor from "@/assets/icon-full-color.svg";

export function DashboardBootSkeleton() {
  const { isLight } = usePortalTheme();
  return (
    <div className="h-full flex flex-col">
      {/* Placeholder voor de selector-/statusrij */}
      <div className="flex items-center justify-between px-4 pt-1">
        <div className="h-11" />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-4">
        <CockpitGaugeBoot iconSrc={isLight ? iconFullColor : iconBright} label="Live data wordt geladen" />
      </div>
      {/* Placeholder voor de carrousel-dots */}
      <div className="h-10" />
    </div>
  );
}
