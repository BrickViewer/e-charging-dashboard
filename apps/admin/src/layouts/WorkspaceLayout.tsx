import { Outlet, NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import logoBright from "@/assets/logo-bright.svg";
import logoFullColor from "@/assets/logo-full-color.svg";
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
import { useMicrosoftAuth } from "@/hooks/useMicrosoftAuth";
import { msSsoEnabled } from "@/lib/msal";

// Gedeelde nav-link voor de sidebar. Hybride accent: de massieve active-balk +
// icoon blijven merkgroen (#05A500), de gloed/halo eromheen gebruikt het
// portal-emerald (--gauge-green). Tokens i.p.v. white/zinc zodat dagmodus
// meekleurt (donker is --foreground 98% ≈ wit → pixel-gelijk).
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group ${
    isActive
      ? "bg-foreground/[0.06] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gauge-green)/0.3)]"
      : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]"
  }`;

function SidebarNavLink({
  to,
  icon: Icon,
  label,
  end,
  newTab,
  onNavigate,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  newTab?: boolean;
  onNavigate: () => void;
}) {
  // Nieuw-venster-items (bv. de sales-demo): zelfde styling, geen active-state,
  // geopend in een eigen venster zoals de configurator-launcher.
  if (newTab) {
    return (
      <a
        href={to}
        className={navLinkClass({ isActive: false })}
        onClick={(e) => {
          e.preventDefault();
          onNavigate();
          window.open(to, "_blank", "noopener,noreferrer,width=1400,height=900");
        }}
      >
        <Icon
          className="w-[18px] h-[18px] flex-shrink-0 transition-colors text-muted-foreground/80 group-hover:text-foreground/90"
          strokeWidth={1.8}
        />
        <span>{label}</span>
      </a>
    );
  }

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
              isActive ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground/90"
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
  const { connectSilently, isConnected } = useMicrosoftAuth();
  const { isLight } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState<string>("");

  const workspace = workspaceForPath(location.pathname);
  const accessible = workspacesForRole(role);
  const activeWorkspace = WORKSPACES[workspace];
  const logo = isLight ? logoFullColor : logoBright;

  // Sync de thema-klassen naar <html> zodat Radix-portals (Dialog, Select,
  // Tooltip — gerenderd in document.body) dezelfde tokens krijgen.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("portal-theme");
    root.classList.toggle("light", isLight);
    return () => root.classList.remove("portal-theme", "light");
  }, [isLight]);

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

  // Eén Microsoft-login voor app + SharePoint: na een Azure-app-login warmen we MSAL stil op
  // (ssoSilent) zodat SharePoint-acties meteen een Graph-token hebben — geen aparte koppel-stap.
  // No-op als SSO uit staat, MSAL al verbonden is, of de gebruiker niet via Microsoft inlogde.
  useEffect(() => {
    if (!msSsoEnabled || isConnected) return;
    const email = user?.email;
    const providers = user?.app_metadata?.providers;
    const viaAzure = user?.app_metadata?.provider === "azure" || (Array.isArray(providers) && providers.includes("azure"));
    if (email && viaAzure) void connectSilently(email);
  }, [user, isConnected, connectSilently]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login/admin");
  };

  const switchWorkspace = (home: string) => {
    setMobileOpen(false);
    navigate(home);
  };

  const sidebarContent = (
    <div className="admin-sidebar-surface flex flex-col h-full relative overflow-hidden">
      {/* Subtle accent glow top-right — emerald, afgestemd op de portal-gloed */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(var(--gauge-green) / 0.10) 0%, transparent 70%)",
        }}
      />

      {/* Brand + werkblad-switcher */}
      <div className="relative px-5 py-6 border-b border-foreground/[0.06]">
        <img src={logo} alt="E-Charging" className="h-8 w-auto max-w-[168px]" />
        {accessible.length > 1 ? (
          (() => {
            const idx = Math.max(0, accessible.indexOf(workspace));
            const go = (d: number) =>
              switchWorkspace(WORKSPACES[accessible[(idx + d + accessible.length) % accessible.length]].home);
            return (
              <div className="mt-4 flex items-center gap-1 rounded-xl bg-foreground/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Vorig werkblad"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span
                  className="flex-1 rounded-lg bg-foreground/[0.08] px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gauge-green)/0.3)]"
                  aria-current="page"
                >
                  {activeWorkspace.label}
                </span>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Volgend werkblad"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            );
          })()
        ) : (
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80 mt-3">
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
            newTab={item.newTab}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* Onderaan: ingelogde gebruiker (met subtiel tandwiel → Instellingen, alleen Beheer-toegang) */}
      <div className="px-3 py-4 border-t border-foreground/[0.06]">
        <div className="px-3 mb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {profileName || user?.email || "Gebruiker"}
            </p>
            {canAccessBeheer(role) && (
              <Link
                to="/admin/instellingen"
                onClick={() => setMobileOpen(false)}
                aria-label="Instellingen"
                title="Instellingen"
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" strokeWidth={1.8} />
              </Link>
            )}
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 mt-1">
            {role || "—"}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] w-full transition-colors uppercase tracking-wider"
        >
          <LogOut className="w-3.5 h-3.5" />
          Uitloggen
        </button>
      </div>
    </div>
  );

  return (
    <div className={`portal-theme${isLight ? " light" : ""} admin-shell min-h-screen bg-background text-foreground`}>
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div>
          <img src={logo} alt="E-Charging" className="h-7 w-auto max-w-[148px]" />
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
        {/* min-w-0: laat main krimpen i.p.v. meegroeien met brede content (Kanban),
            zodat overflow-x-auto-blokken intern scrollen en de pagina niet horizontaal schuift. */}
        <main className="flex-1 min-w-0 min-h-screen lg:ml-[240px]">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
