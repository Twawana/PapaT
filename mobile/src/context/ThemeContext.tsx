import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { loadThemeMode, saveThemeMode } from "../services/themePreferences";
import { resolveThemeColors, ThemeColors, ThemeMode } from "../theme/colors";

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const savedMode = await loadThemeMode();
      if (!cancelled) {
        setModeState(savedMode);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void saveThemeMode(nextMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((current) => {
      const nextMode: ThemeMode = current === "dark" ? "light" : "dark";
      void saveThemeMode(nextMode);
      return nextMode;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark: mode === "dark",
      colors: resolveThemeColors(mode),
      setMode,
      toggleTheme,
    }),
    [mode, setMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
