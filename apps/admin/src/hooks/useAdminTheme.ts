// Admin-thema (dag/nacht) — zelfde module-store-patroon als usePortalTheme,
// maar accountgebonden: de bron van waarheid is user_metadata.admin_theme in
// Supabase Auth, zodat de voorkeur op elk apparaat meereist. localStorage
// ("ec-admin-theme") is alleen een instant-paint cache tegen een flits bij
// koude start; de auth-laag synct de echte accountwaarde zodra de sessie laadt.
import { useCallback, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY = "ec-admin-theme"; // cache: "light" | "dark"

export type AdminTheme = "dark" | "light";

let theme: AdminTheme = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark"; // localStorage onbeschikbaar (private mode) → standaard donker
  }
})();

const listeners = new Set<() => void>();

function applyTheme(next: AdminTheme) {
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Niet persistent (private mode) — in-memory wisselen werkt nog steeds.
  }
  listeners.forEach((listener) => listener());
}

/** Door de auth-laag aangeroepen zodra de sessie/user bekend is. Leest
 *  user_metadata.admin_theme en lijnt store + cache daarop uit. Idempotent —
 *  het USER_UPDATED-event na updateUser komt hier ook langs (no-op). Bij
 *  uitloggen (user = null) behouden we het laatste thema. */
export function syncAdminThemeFromUser(user: User | null) {
  if (!user) return;
  const next: AdminTheme = user.user_metadata?.admin_theme === "light" ? "light" : "dark";
  if (next !== theme) applyTheme(next);
}

function persistTheme(next: AdminTheme) {
  if (next === theme) return;
  applyTheme(next); // direct toepassen: store + cache + re-render
  // Fire-and-forget naar het account; alleen melden als het misgaat.
  supabase.auth
    .updateUser({ data: { admin_theme: next } })
    .then(({ error }) => {
      if (error) toast.error("Themavoorkeur kon niet bij je account worden opgeslagen");
    })
    .catch(() => toast.error("Themavoorkeur kon niet bij je account worden opgeslagen"));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdminTheme() {
  const current = useSyncExternalStore(subscribe, () => theme);
  const toggle = useCallback(() => {
    persistTheme(theme === "light" ? "dark" : "light");
  }, []);
  const setTheme = useCallback((next: AdminTheme) => {
    persistTheme(next);
  }, []);
  return { theme: current, isLight: current === "light", toggle, setTheme };
}
