import { createContext } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";

type UserRole = "admin" | "manager" | "viewer" | "client" | null;

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  isInternal: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
