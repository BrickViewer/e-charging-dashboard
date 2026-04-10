import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { LayoutDashboard, Users, Calculator, Wallet, Plug, Settings, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/klanten", icon: Users, label: "Klanten" },
  { to: "/admin/calculator", icon: Calculator, label: "Offertes & Calculator" },
  { to: "/admin/financieel", icon: Wallet, label: "Financieel" },
  { to: "/admin/laadpunten", icon: Plug, label: "Laadpunten" },
  { to: "/admin/instellingen", icon: Settings, label: "Instellingen" },
];

export default function AdminLayout() {
  const { signOut, role } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border">
        <Logo subtitle="Beheer" />
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block fixed lg:sticky top-0 left-0 z-40 w-64 h-screen bg-card border-r border-border flex-shrink-0`}>
          <div className="p-6 hidden lg:block">
            <Logo subtitle="Beheer" />
          </div>
          <nav className="px-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
            <div className="flex items-center gap-2 px-3 py-1 mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{role}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Uitloggen
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-screen">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 bg-background/80 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
    </div>
  );
}
