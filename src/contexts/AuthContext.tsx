import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UserRole = "admin" | "manager" | "viewer" | "client" | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole;
  isInternal: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch role in a separate effect — never inside onAuthStateChange
  useEffect(() => {
    let cancelled = false;

    const fetchRole = async (userId: string) => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (cancelled) return;

      if (roles && roles.length > 0) {
        if (roles.some((r: any) => r.role === "admin")) { setRole("admin"); setIsLoading(false); return; }
        if (roles.some((r: any) => r.role === "manager")) { setRole("manager"); setIsLoading(false); return; }
        if (roles.some((r: any) => r.role === "viewer")) { setRole("viewer"); setIsLoading(false); return; }
      }

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("portal_user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (client) { setRole("client"); } else { setRole(null); }
      setIsLoading(false);
    };

    if (user) {
      setIsLoading(true);
      fetchRole(user.id);
    } else {
      setRole(null);
      setIsLoading(false);
    }

    return () => { cancelled = true; };
  }, [user]);

  // Auth listener — synchronous only, no awaits
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // Restore session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  const isInternal = role === "admin" || role === "manager" || role === "viewer";

  return (
    <AuthContext.Provider value={{ session, user, role, isInternal, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
