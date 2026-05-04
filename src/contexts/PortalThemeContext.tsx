import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface PortalThemeContextValue {
  isLight: boolean;
  toggle: () => void;
}

const PortalThemeContext = createContext<PortalThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "portal-theme-mode";

export function PortalThemeProvider({ children }: { children: ReactNode }) {
  const [isLight, setIsLight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "light";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, isLight ? "light" : "dark");
  }, [isLight]);

  return (
    <PortalThemeContext.Provider value={{ isLight, toggle: () => setIsLight((v) => !v) }}>
      {children}
    </PortalThemeContext.Provider>
  );
}

export function usePortalTheme() {
  const ctx = useContext(PortalThemeContext);
  if (!ctx) throw new Error("usePortalTheme must be used within a PortalThemeProvider");
  return ctx;
}
