import { Link, useLocation } from "react-router-dom";
import { Activity, Wallet, User, Bell, type LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: "/portal/sessies", label: "Sessies", icon: Activity },
  { to: "/portal/financieel", label: "Financieel", icon: Wallet },
  { to: "/portal/gegevens", label: "Mijn gegevens", icon: User },
  { to: "/portal/berichten", label: "Berichten", icon: Bell },
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

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
    return <NavTile key={item.to} item={item} isActive={isActive} />;
  };

  return (
    <nav className="portal-nav-stack">
      {navItems.map(renderItem)}
    </nav>
  );
}
