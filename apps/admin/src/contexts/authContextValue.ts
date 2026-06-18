import { createContext } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";

// role blijft de data-toegangsrol (superadmin houdt 'admin' zodat alle admin-guards
// blijven werken). De superadmin-status staat los in isSuperadmin.
export type UserRole = "admin" | "manager" | "viewer" | "sales" | "marketing" | "client" | null;

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  isInternal: boolean;
  isSuperadmin: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  // Staf-login via Microsoft/Entra (OAuth). Volle redirect; sessie + rol worden daarna
  // langs de normale weg geladen. Gated op msSsoEnabled in de UI.
  signInWithMicrosoft: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
