import { Link, useLocation } from "react-router-dom";
import { Activity, Wallet, User, Bell, type LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { to: "/portal/sessies", label: "Sessies", icon: Activity },
  { to: "/portal/financieel", label: "Financieel", icon: Wallet },
  { to: "/portal/gegevens", label: "Mijn gegevens", icon: User },
  { to: "/portal/berichten", label: "Berichten", icon: Bell },
];

export function NavIconBar() {
  const { pathname } = useLocation();

  return (
    <nav className="flex items-center justify-center gap-6 sm:gap-10">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col items-center gap-2"
            aria-current={isActive ? "page" : undefined}
          >
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all
                ${isActive
                  ? "bg-primary/15 border border-primary/50 shadow-md shadow-primary/10"
                  : "bg-card border border-border group-hover:border-primary/50 group-hover:bg-card/80 group-active:scale-95"
                }`}
            >
              <Icon
                className={`w-6 h-6 ${isActive ? "text-primary" : "text-primary/85"}`}
                strokeWidth={1.8}
              />
            </div>
            <span
              className={`text-[10px] uppercase tracking-widest font-medium ${
                isActive ? "text-foreground" : "text-muted-foreground/80"
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
