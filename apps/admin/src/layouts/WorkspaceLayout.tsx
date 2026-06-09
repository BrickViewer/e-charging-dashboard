import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logoBright from "@/assets/logo-bright.svg";
import { Settings, LogOut, Menu, X, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  WORKSPACES,
  workspaceForPath,
  workspacesForRole,
  canAccessBeheer,
} from "@/lib/workspaces";

// Gedeelde nav-link voor de sidebar. Hybride accent: de massieve active-balk +
// icoon blijven merkgroen (#05A500), de gloed/halo eromheen gebruikt het
// portal-emerald (--gauge-green).
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group ${
    isActive
      ? "bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_hsl(140_70%_55%/0.3)]"
      : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
  }`;

function SidebarNavLink({
  to,
  icon: Icon,
  label,
  end,
  onNavigate,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className={navLinkClass}>
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
              style={{
                background: "linear-gradient(180deg, #05A500 0%, #08c400 100%)",
                boxShadow: "0 0 12px hsl(var(--gauge-green) / 0.5)",
              }}
            />
          )}
          <Icon
            className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
              isActive ? "text-primary" : "text-zinc-500 group-hover:text-zinc-300"
            }`}
            strokeWidth={1.8}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function WorkspaceLayout() {
  const { signOut, role, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState<string>("");

  const workspace = workspaceForPath(location.pathname);
  const accessible = workspacesForRole(role);
  const activeWorkspace = WORKSPACES[workspace];

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

  const switchWorkspace = (home: string) => {
    setMobileOpen(false);
    navigate(home);
  };

  const sidebarContent = (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, hsl(222 24% 5%) 0%, hsl(222 22% 7%) 100%)",
      }}
    >
      {/* Subtle accent glow top-right — emerald, afgestemd op de portal-gloed */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(var(--gauge-green) / 0.10) 0%, transparent 70%)",
        }}
      />

      {/* Brand + werkblad-switcher */}
      <div className="relative px-5 py-6 border-b border-white/[0.06]">
        <img src={logoBright} alt="E-Charging" className="h-8 w-auto max-w-[168px]" />
        {accessible.length > 1 ? (
          (() => {
            const idx = Math.max(0, accessible.indexOf(workspace));
            const go = (d: number) =>
              switchWorkspace(WORKSPACES[accessible[(idx + d + accessible.length) % accessible.length]].home);
            return (
              <div className="mt-4 flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Vorig werkblad"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span
                  className="flex-1 rounded-lg bg-white/[0.08] px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_1px_hsl(140_70%_55%/0.3)]"
                  aria-current="page"
                >
                  {activeWorkspace.label}
                </span>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Volgend werkblad"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })()
        ) : (
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mt-3">
            {activeWorkspace.label}
          </p>
        )}
      </div>

      {/* Werkblad-navigatie */}
      <nav className="flex-1 px-3 py-4 space-y-1 relative">
        {activeWorkspace.items.map((item) => (
          <SidebarNavLink
            key={item.to}
            to={item.to}
            end={item.end}
            icon={item.icon}
            label={item.label}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* Onderaan: Instellingen (alleen Beheer-toegang) + ingelogde gebruiker */}
      <div className="px-3 py-4 border-t border-white/[0.06]">
        {canAccessBeheer(role) && (
          <SidebarNavLink
            to="/admin/instellingen"
            icon={Settings}
            label="Instellingen"
            onNavigate={() => setMobileOpen(false)}
          />
        )}
        <div className="my-2 border-t border-white/[0.06]" />
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
          <img src={logoBright} alt="E-Charging" className="h-7 w-auto max-w-[148px]" />
          <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground mt-1">
            {activeWorkspace.label}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      <div className="flex">
        {/* Sidebar — desktop */}
        <aside className="admin-sidebar hidden lg:block fixed top-0 left-0 z-40 w-[240px] h-screen flex-shrink-0">
          {sidebarContent}
        </aside>

        {/* Sidebar — mobile overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="admin-sidebar fixed top-0 left-0 z-50 w-[240px] h-screen lg:hidden">
              {sidebarContent}
            </aside>
          </>
        )}

        {/* Main content — ambient gloed komt van .admin-shell (index.css) */}
        <main className="flex-1 min-h-screen lg:ml-[240px]">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
