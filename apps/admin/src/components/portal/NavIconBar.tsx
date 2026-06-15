import { Link, useLocation } from "react-router-dom";
import { Activity, Wallet, User, Bell, type LucideIcon } from "lucide-react";
import { useDemoMode } from "@/contexts/demoModeContextValue";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Sub-paden: de base (/portal of /demo) wordt er in de component voorgeplakt.
const navItems: NavItem[] = [
  { to: "sessies", label: "Sessies", icon: Activity },
  { to: "financieel", label: "Financieel", icon: Wallet },
  { to: "gegevens", label: "Mijn gegevens", icon: User },
  { to: "berichten", label: "Berichten", icon: Bell },
];

function NavTile({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      key={item.to}
      to={item.to}
      className="portal-nav-link group"
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      title={item.label}
      data-active={isActive ? "true" : "false"}
    >
      <Icon className="portal-nav-icon w-5 h-5 sm:w-5 sm:h-5" strokeWidth={1.65} />
    </Link>
  );
}

export function NavIconBar() {
  const { pathname } = useLocation();
  const base = useDemoMode() ? "/demo" : "/portal";

  const renderItem = (item: NavItem) => {
    const to = `${base}/${item.to}`;
    const isActive = pathname === to || pathname.startsWith(to + "/");
    return <NavTile key={to} item={{ ...item, to }} isActive={isActive} />;
  };

  return (
    <nav className="portal-nav-stack">
      {navItems.map(renderItem)}
    </nav>
  );
}
