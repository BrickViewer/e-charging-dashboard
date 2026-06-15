// Portal-thema (dag/nacht) — module-store + useSyncExternalStore, zodat
// elke component (layout, nav, instellingen) dezelfde state deelt zonder
// provider of prop-drilling. Donker is de standaard; de voorkeur wordt
// bewaard in localStorage en bij module-init gelezen (vóór de eerste render).
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ec-portal-theme"; // "light" | "dark"

export type PortalTheme = "dark" | "light";

let theme: PortalTheme = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark"; // localStorage onbeschikbaar (bv. private mode) → standaard donker
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
