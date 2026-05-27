import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider } from "@mui/material/styles";

import { themeOptions, themes, type ThemeName } from "./theme";

const STORAGE_KEY = "hillco2.theme";

interface AppThemeContextValue {
  current: ThemeName;
  available: typeof themeOptions;
  setCurrent: (name: ThemeName) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function readInitialTheme(): ThemeName {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored in themes ? (stored as ThemeName) : "default";
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [current, setCurrentState] = useState<ThemeName>(() => readInitialTheme());

  const value = useMemo<AppThemeContextValue>(() => {
    const setCurrent = (name: ThemeName) => {
      setCurrentState(name);
      window.localStorage.setItem(STORAGE_KEY, name);
    };
    return { current, available: themeOptions, setCurrent };
  }, [current]);

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={themes[current]}>{children}</ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}
