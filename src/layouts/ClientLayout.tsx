import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { LayoutDashboard, Activity, Wallet, User, Bell, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const navItems = [
  { to: "/portal", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/portal/sessies", icon: Activity, label: "Sessies" },
  { to: "/portal/financieel", icon: Wallet, label: "Financieel" },
  { to: "/portal/gegevens", icon: User, label: "Mijn gegevens" },
  { to: "/portal/berichten", icon: Bell, label: "Berichten" },
];

export default function ClientLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="portal-theme min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border">
        <Logo />
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`${mobileOpen ? "block" : "hidden"} lg:block fixed lg:sticky top-0 left-0 z-40 w-64 h-screen bg-card border-r border-border flex-shrink-0 shadow-sm`}>
          <div className="p-6 hidden lg:block">
            <Logo />
          </div>
          <nav className="px-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/portal"}
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
        <main className="flex-1 min-h-screen lg:ml-0">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-background/80 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
    </div>
  );
}
