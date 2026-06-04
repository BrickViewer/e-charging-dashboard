import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logoBright from "@/assets/logo-bright.svg";
import {
  LayoutDashboard,
  Users,
  Wallet,
  MapPin,
  Settings,
  LogOut,
  Menu,
  X,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const mainNavItems = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/klanten", icon: Users, label: "Klanten" },
  { to: "/admin/locaties", icon: MapPin, label: "Locaties" },
  { to: "/admin/financieel", icon: Wallet, label: "Financieel" },
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
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, hsl(222 24% 5%) 0%, hsl(222 22% 7%) 100%)",
      }}
    >
      {/* Subtle accent glow top-right */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(118 100% 32% / 0.15) 0%, transparent 70%)",
        }}
      />

      {/* Brand */}
      <div className="relative px-5 py-6 border-b border-white/[0.06]">
        <img
          src={logoBright}
          alt="E-Charging"
          className="h-8 w-auto max-w-[168px]"
        />
        <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mt-3">
          Beheer
        </p>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 relative">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group ${
                isActive
                  ? "bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_hsl(118_100%_32%/0.3)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                    style={{
                      background:
                        "linear-gradient(180deg, #05A500 0%, #08c400 100%)",
                      boxShadow: "0 0 12px hsl(118 100% 40% / 0.5)",
                    }}
                  />
                )}
                <item.icon
                  className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                    isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  strokeWidth={1.8}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Separator */}
        <div className="my-3 border-t border-white/[0.06]" />

        <NavLink
          to="/admin/instellingen"
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group ${
              isActive
                ? "bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_hsl(118_100%_32%/0.3)]"
                : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                  style={{
                    background:
                      "linear-gradient(180deg, #05A500 0%, #08c400 100%)",
                    boxShadow: "0 0 12px hsl(118 100% 40% / 0.5)",
                  }}
                />
              )}
              <Settings
                className={`w-[18px] h-[18px] flex-shrink-0 ${
                  isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
                strokeWidth={1.8}
              />
              <span>Instellingen</span>
            </>
          )}
        </NavLink>
        {(role === "admin" || role === "manager") && (
          <NavLink
            to="/admin/instellingen/configurator"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group ${
                isActive
                  ? "bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_hsl(118_100%_32%/0.3)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                    style={{
                      background:
                        "linear-gradient(180deg, #05A500 0%, #08c400 100%)",
                      boxShadow: "0 0 12px hsl(118 100% 40% / 0.5)",
                    }}
                  />
                )}
                <WandSparkles
                  className={`w-[18px] h-[18px] flex-shrink-0 ${
                    isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  strokeWidth={1.8}
                />
                <span>Configuratie</span>
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* User profile */}
      <div className="px-3 py-4 border-t border-white/[0.06]">
        <div className="px-3 mb-3">
          <p className="text-sm font-medium text-white truncate">
            {profileName || user?.email || "Gebruiker"}
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">
            {role || "—"}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] w-full transition-colors uppercase tracking-wider"
        >
          <LogOut className="w-3.5 h-3.5" />
          Uitloggen
        </button>
      </div>
    </div>
  );

  return (
    <div className="portal-theme admin-shell min-h-screen bg-background text-foreground">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <img
            src={logoBright}
            alt="E-Charging"
            className="h-7 w-auto max-w-[148px]"
          />
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground mt-1">
              Beheer
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block fixed top-0 left-0 z-40 w-[240px] h-screen flex-shrink-0 border-r border-white/[0.06]">
          {sidebarContent}
        </aside>

        {/* Sidebar — mobile overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed top-0 left-0 z-50 w-[240px] h-screen lg:hidden">
              {sidebarContent}
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-h-screen lg:ml-[240px]">
          {/* Subtle ambient glow in upper-left corner of content area */}
          <div className="relative">
            <div
              className="absolute top-0 left-0 w-[600px] h-[400px] pointer-events-none opacity-50"
              style={{
                background:
                  "radial-gradient(ellipse at top left, hsl(200 100% 60% / 0.04) 0%, transparent 60%)",
              }}
            />
            <div className="relative p-4 lg:p-8 max-w-7xl mx-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
