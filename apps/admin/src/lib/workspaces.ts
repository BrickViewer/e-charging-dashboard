import {
  LayoutDashboard,
  Users,
  MapPin,
  Wallet,
  Target,
  FileText,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/contexts/authContextValue";

// Top-level werkbladen (Beheer / Sales). Eén bron van waarheid voor zowel de
// navigatie als de rol-gebaseerde toegang + de switcher.

export type WorkspaceKey = "beheer" | "sales";

export type NavItem = { to: string; icon: LucideIcon; label: string; end?: boolean };

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
      { to: "/sales/offertes", icon: FileText, label: "Offertes" },
      { to: "/sales/configurator", icon: WandSparkles, label: "Configurator" },
    ],
  },
};

export const WORKSPACE_ORDER: WorkspaceKey[] = ["beheer", "sales"];

// Welke werkbladen mag deze rol zien?
export function workspacesForRole(role: UserRole): WorkspaceKey[] {
  if (!role) return [];
  return WORKSPACE_ORDER.filter((key) => WORKSPACES[key].roles.includes(role));
}

// Huidig werkblad afgeleid uit het pad.
export function workspaceForPath(pathname: string): WorkspaceKey {
  return pathname.startsWith("/sales") ? "sales" : "beheer";
}

export function canAccessBeheer(role: UserRole): boolean {
  return workspacesForRole(role).includes("beheer");
}
