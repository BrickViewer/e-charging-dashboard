import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Wallet,
  Plug,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const mainNavItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/klanten", icon: Users, label: "Klanten" },
  { to: "/admin/offertes", icon: FileText, label: "Offertes" },
  { to: "/admin/calculator", icon: Calculator, label: "Calculator" },
  { to: "/admin/financieel", icon: Wallet, label: "Financieel" },
  { to: "/admin/laadpunten", icon: Plug, label: "Laadpunten" },
];

export default function AdminLayout() {
  const { signOut, role, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState<string>("");

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.full_name) setProfileName(data.full_name);
        });
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: '#1A1A1E' }}>
      {/* Logo */}
      <div className="px-5 py-6">
        <Logo variant="dark" subtitle="Beheer" className="[&_img]:h-9" />
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-white border-l-[3px] border-l-primary -ml-px"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}

        {/* Separator */}
        <div className="my-4 border-t border-white/10" />

        <NavLink
          to="/admin/instellingen"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-white/10 text-white border-l-[3px] border-l-primary -ml-px"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`
          }
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          Instellingen
        </NavLink>
      </nav>

      {/* User profile */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-3 mb-2">
          <p className="text-sm font-medium text-white truncate">
            {profileName || user?.email || "Gebruiker"}
          </p>
          <p className="text-xs text-gray-400 capitalize">{role}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Uitloggen
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <Logo subtitle="Beheer" />
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block fixed top-0 left-0 z-40 w-[260px] h-screen flex-shrink-0">
          {sidebarContent}
        </aside>

        {/* Sidebar — mobile overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed top-0 left-0 z-50 w-[260px] h-screen lg:hidden">
              {sidebarContent}
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-h-screen lg:ml-[260px]">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
