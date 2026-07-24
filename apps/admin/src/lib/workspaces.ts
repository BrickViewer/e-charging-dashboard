import {
  LayoutDashboard,
  Users,
  MapPin,
  Wallet,
  Target,
  ListChecks,
  FileText,
  WandSparkles,
  Contact,
  Newspaper,
  MonitorPlay,
  AlertTriangle,
  Rocket,
  Sparkles,
  BarChart3,
  Tags,
  Package,
  CalendarDays,
  Crosshair,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/contexts/authContextValue";

// Top-level werkbladen. Eén bron van waarheid voor zowel de navigatie als de
// rol-gebaseerde toegang + de switcher. NB: het werkblad met label "Admin"
// (directie-cockpit) woont op /admin; het klassieke beheer op /beheer.

export type WorkspaceKey = "directie" | "beheer" | "sales" | "marketing";

export type NavItem = { to: string; icon: LucideIcon; label: string; end?: boolean; newTab?: boolean };

export type Workspace = {
  key: WorkspaceKey;
  label: string;
  home: string;
  roles: string[];
  items: NavItem[];
};

export const WORKSPACES: Record<WorkspaceKey, Workspace> = {
  // Directie-cockpit: bedrijfsbrede sturing (KPI's/doelen, agenda, alle taken).
  directie: {
    key: "directie",
    label: "Admin",
    home: "/admin",
    roles: ["admin"],
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/admin/agenda", icon: CalendarDays, label: "Agenda" },
      { to: "/admin/taken", icon: ListChecks, label: "Taken" },
      { to: "/admin/facturatie", icon: Receipt, label: "Facturatie" },
      { to: "/admin/doelen", icon: Crosshair, label: "Doelen" },
    ],
  },
  beheer: {
    key: "beheer",
    label: "Beheer",
    home: "/beheer",
    roles: ["admin", "manager", "viewer"],
    items: [
      { to: "/beheer", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/beheer/klanten", icon: Users, label: "Klanten" },
      { to: "/beheer/locaties", icon: MapPin, label: "Locaties" },
      { to: "/beheer/storingen", icon: AlertTriangle, label: "Storingen" },
      { to: "/beheer/financieel", icon: Wallet, label: "Financieel" },
    ],
  },
  sales: {
    key: "sales",
    label: "Sales",
    home: "/sales/leads",
    roles: ["admin", "manager", "sales"],
    items: [
      { to: "/sales/leads", icon: Target, label: "Leads" },
      { to: "/sales/taken", icon: ListChecks, label: "Taken" },
      { to: "/sales/contacten", icon: Contact, label: "Contacten" },
      { to: "/sales/offertes", icon: FileText, label: "Offertes" },
      // Onboarding-pijplijn: de hele flow na de getekende offerte (incl. installateur-handoff)
      { to: "/sales/onboarding", icon: Rocket, label: "Onboarding" },
      // Productcatalogus voor de interne kostencalculator
      { to: "/sales/catalogus", icon: Package, label: "Catalogus" },
      { to: "/sales/configurator", icon: WandSparkles, label: "Configurator" },
      // Opent het fictieve klantportaal in een eigen venster (configurator-patroon)
      { to: "/demo", icon: MonitorPlay, label: "Demo", newTab: true },
    ],
  },
  marketing: {
    key: "marketing",
    label: "Marketing",
    home: "/marketing/content",
    roles: ["admin", "manager", "marketing"],
    items: [
      { to: "/marketing/content", icon: Sparkles, label: "Content" },
      { to: "/marketing/blogs", icon: Newspaper, label: "Blogs" },
      { to: "/marketing/categorieen", icon: Tags, label: "Categorieën" },
      { to: "/marketing/prestaties", icon: BarChart3, label: "Blogprestaties" },
    ],
  },
};

export const WORKSPACE_ORDER: WorkspaceKey[] = ["directie", "beheer", "sales", "marketing"];

// De rollen die een werkblad mogen openen — één bron voor zowel de navigatie als de
// route-gating (RequireAuth in App.tsx), zodat de toegangsmatrix niet kan divergeren.
export function rolesForWorkspace(key: WorkspaceKey): string[] {
  return WORKSPACES[key].roles;
}

// Welke werkbladen mag deze rol zien?
export function workspacesForRole(role: UserRole): WorkspaceKey[] {
  if (!role) return [];
  return WORKSPACE_ORDER.filter((key) => WORKSPACES[key].roles.includes(role));
}

// Huidig werkblad afgeleid uit het pad.
export function workspaceForPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/marketing")) return "marketing";
  if (pathname.startsWith("/admin")) return "directie";
  return "beheer";
}

export function canAccessBeheer(role: UserRole): boolean {
  return workspacesForRole(role).includes("beheer");
}

export function canAccessMarketing(role: UserRole): boolean {
  return workspacesForRole(role).includes("marketing");
}
