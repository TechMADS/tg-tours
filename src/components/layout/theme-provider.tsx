"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

function parseTheme(value: string | null): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

let memoryTheme: Theme = "system";
const subscribers = new Set<() => void>();
let stopListening: (() => void) | null = null;

function getThemePreference(): Theme {
  try {
    memoryTheme = parseTheme(window.localStorage.getItem("theme"));
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
  return memoryTheme;
}

function getResolvedTheme(theme: Theme): ResolvedTheme {
  return theme === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : theme;
}

function applyTheme(theme: Theme) {
  const resolved = getResolvedTheme(theme);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

function getThemeSnapshot() {
  const theme = getThemePreference();
  return `${theme}|${getResolvedTheme(theme)}`;
}

function subscribeToTheme(listener: () => void) {
  subscribers.add(listener);
  if (!stopListening) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "theme" && event.key !== null) return;
      applyTheme(getThemePreference());
      subscribers.forEach((subscriber) => subscriber());
    };
    const handleSystemChange = () => {
      if (getThemePreference() !== "system") return;
      applyTheme("system");
      subscribers.forEach((subscriber) => subscriber());
    };
    window.addEventListener("storage", handleStorage);
    mediaQuery.addEventListener("change", handleSystemChange);
    applyTheme(getThemePreference());
    stopListening = () => {
      window.removeEventListener("storage", handleStorage);
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }

  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      stopListening?.();
      stopListening = null;
    }
  };
}

function getServerThemeSnapshot() {
  return "system|light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const [storedTheme, resolvedTheme] = snapshot.split("|");
  const theme = parseTheme(storedTheme);
  const resolved = resolvedTheme === "dark" ? "dark" : "light";
  const setTheme = useCallback((nextTheme: Theme) => {
    memoryTheme = nextTheme;
    try {
      window.localStorage.setItem("theme", nextTheme);
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
    applyTheme(nextTheme);
    subscribers.forEach((subscriber) => subscriber());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}