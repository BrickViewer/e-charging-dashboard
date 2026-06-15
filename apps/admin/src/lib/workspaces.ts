import {
  LayoutDashboard,
  Users,
  MapPin,
  Wallet,
  Target,
  FileText,
  WandSparkles,
  Contact,
  Wrench,
  Newspaper,
  MonitorPlay,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/contexts/authContextValue";

// Top-level werkbladen (Beheer / Sales). Eén bron van waarheid voor zowel de
// navigatie als de rol-gebaseerde toegang + de switcher.

export type WorkspaceKey = "beheer" | "sales" | "marketing";

export type NavItem = { to: string; icon: LucideIcon; label: string; end?: boolean; newTab?: boolean };

export type Workspace = {
  key: WorkspaceKey;
  label: string;
  home: string;
  roles: string[];
  items: NavItem[];
};

export const WORKSPACES: Record<WorkspaceKey, Workspace> = {
  beheer: {
    key: "beheer",
    label: "Beheer",
    home: "/admin",
    roles: ["admin", "manager", "viewer"],
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/admin/klanten", icon: Users, label: "Klanten" },
      { to: "/admin/locaties", icon: MapPin, label: "Locaties" },
      { to: "/admin/storingen", icon: AlertTriangle, label: "Storingen" },
      { to: "/admin/financieel", icon: Wallet, label: "Financieel" },
    ],
  },
  sales: {
    key: "sales",
    label: "Sales",
    home: "/sales/leads",
    roles: ["admin", "manager", "sales"],
    items: [
      { to: "/sales/leads", icon: Target, label: "Leads" },
      { to: "/sales/contacten", icon: Contact, label: "Contacten" },
      { to: "/sales/offertes", icon: FileText, label: "Offertes" },
      // Installaties volgen uit getekende offertes — hoort bij de salesflow
      { to: "/sales/installaties", icon: Wrench, label: "Installaties" },
      { to: "/sales/configurator", icon: WandSparkles, label: "Configurator" },
      // Opent het fictieve klantportaal in een eigen venster (configurator-patroon)
      { to: "/demo", icon: MonitorPlay, label: "Demo", newTab: true },
    ],
  },
  marketing: {
    key: "marketing",
    label: "Marketing",
    home: "/marketing/blogs",
    roles: ["admin", "manager", "marketing"],
    items: [
      { to: "/marketing/blogs", icon: Newspaper, label: "Blogs" },
    ],
  },
};

export const WORKSPACE_ORDER: WorkspaceKey[] = ["beheer", "sales", "marketing"];

// Welke werkbladen mag deze rol zien?
export function workspacesForRole(role: UserRole): WorkspaceKey[] {
  if (!role) return [];
  return WORKSPACE_ORDER.filter((key) => WORKSPACES[key].roles.includes(role));
}

// Huidig werkblad afgeleid uit het pad.
export function workspaceForPath(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/marketing")) return "marketing";
  return "beheer";
}

export function canAccessBeheer(role: UserRole): boolean {
  return workspacesForRole(role).includes("beheer");
}

export function canAccessMarketing(role: UserRole): boolean {
  return workspacesForRole(role).includes("marketing");
}
