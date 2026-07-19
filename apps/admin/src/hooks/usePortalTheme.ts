// Portal-thema (dag/nacht) — module-store + useSyncExternalStore, zodat
// elke component (layout, nav, instellingen) dezelfde state deelt zonder
// provider of prop-drilling. Licht is de standaard; de voorkeur wordt
// bewaard in localStorage en bij module-init gelezen (vóór de eerste render).
import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "ec-portal-theme"; // "light" | "dark"

export type PortalTheme = "dark" | "light";

let theme: PortalTheme = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // localStorage onbeschikbaar (bv. private mode) → standaard licht
  }
})();

const listeners = new Set<() => void>();

function setTheme(next: PortalTheme) {
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Niet persistent (private mode) — in-memory wisselen werkt nog steeds.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePortalTheme() {
  const current = useSyncExternalStore(subscribe, () => theme);
  const toggle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, []);
  return { theme: current, isLight: current === "light", toggle };
}

// Zet de thema-klassen óók op <html>, zodat Radix-portals (toasts, dialogs,
// popovers — gemount in document.body) dezelfde tokens erven als de pagina.
// Gebruikt door layouts én losstaande schermen (login, uitnodiging, wizard).
export function usePortalThemeSync() {
  const state = usePortalTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("portal-theme");
    root.classList.toggle("light", state.isLight);
    return () => root.classList.remove("portal-theme", "light");
  }, [state.isLight]);
  return state;
}
