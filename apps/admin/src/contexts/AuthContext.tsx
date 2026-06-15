import { useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type UserRole } from "@/contexts/authContextValue";
import { syncAdminThemeFromUser } from "@/hooks/useAdminTheme";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  // Los van role: heeft deze gebruiker de superadmin-rol? (superadmin heeft óók 'admin')
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  // Twee aparte loading-flags voorkomen de witte-scherm-race-condition:
  //  - sessionRestored: pas true als de eerste getSession() of onAuthStateChange klaar is
  //  - roleResolved: pas true als de role-fetch klaar is (of user=null)
  // isLoading combineert beide — zo redirect RequireAuth nooit op een halfgeladen state.
  const [sessionRestored, setSessionRestored] = useState(false);
  const [roleResolved, setRoleResolved] = useState(false);

  const isLoading = !sessionRestored || (user !== null && !roleResolved);

  // Auth listener — synchroon, geen awaits binnen de callback
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        syncAdminThemeFromUser(session?.user ?? null); // accountgebonden admin-thema (synchroon)
        setSessionRestored(true);
      },
    );

    // Restore session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      syncAdminThemeFromUser(session?.user ?? null);
      setSessionRestored(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch role apart — pas nadat sessie hersteld is en alleen als er een user is
  useEffect(() => {
    if (!sessionRestored) return;

    let cancelled = false;

    if (!user) {
      setRole(null);
      setIsSuperadmin(false);
      setRoleResolved(true);
      return;
    }

    setRoleResolved(false);

    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (cancelled) return;

      if (roles && roles.length > 0) {
        // superadmin is een markering bovenop 'admin'; role blijft de data-toegangsrol
        setIsSuperadmin(roles.some(r => r.role === "superadmin"));
        if (roles.some(r => r.role === "admin" || r.role === "superadmin")) {
          setRole("admin");
          setRoleResolved(true);
          return;
        }
        if (roles.some(r => r.role === "manager")) {
          setRole("manager");
          setRoleResolved(true);
          return;
        }
        if (roles.some(r => r.role === "sales")) {
          setRole("sales");
          setRoleResolved(true);
          return;
        }
        if (roles.some(r => r.role === "marketing")) {
          setRole("marketing");
          setRoleResolved(true);
          return;
        }
        if (roles.some(r => r.role === "viewer")) {
          setRole("viewer");
          setRoleResolved(true);
          return;
        }
      } else {
        setIsSuperadmin(false);
      }

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("portal_user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setRole(client ? "client" : null);
      setRoleResolved(true);
    })();

    return () => { cancelled = true; };
  }, [user, sessionRestored]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setIsSuperadmin(false);
  };

  const isInternal = role === "admin" || role === "manager" || role === "viewer" || role === "sales" || role === "marketing";

  return (
    <AuthContext.Provider
      value={{ session, user, role, isInternal, isSuperadmin, isLoading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
