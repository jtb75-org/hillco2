import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeProvider } from "@mui/material/styles";

import {
  buildTheme,
  schemeOptions,
  windowStyleOptions,
  type SchemeName,
  type WindowStyleName,
} from "./theme";

// "hillco2.theme" predates the scheme/style split — keep the key so
// existing users' color-scheme choice survives the upgrade.
const SCHEME_STORAGE_KEY = "hillco2.theme";
const STYLE_STORAGE_KEY = "hillco2.windowStyle";

interface AppThemeContextValue {
  scheme: SchemeName;
  style: WindowStyleName;
  schemes: typeof schemeOptions;
  styles: typeof windowStyleOptions;
  setScheme: (name: SchemeName) => void;
  setStyle: (name: WindowStyleName) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function readStored<T extends string>(
  key: string,
  valid: readonly { name: T }[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return valid.some((option) => option.name === stored) ? (stored as T) : fallback;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<SchemeName>(() =>
    readStored(SCHEME_STORAGE_KEY, schemeOptions, "default"),
  );
  const [style, setStyleState] = useState<WindowStyleName>(() =>
    readStored(STYLE_STORAGE_KEY, windowStyleOptions, "classic"),
  );

  const value = useMemo<AppThemeContextValue>(() => {
    const setScheme = (name: SchemeName) => {
      setSchemeState(name);
      window.localStorage.setItem(SCHEME_STORAGE_KEY, name);
    };
    const setStyle = (name: WindowStyleName) => {
      setStyleState(name);
      window.localStorage.setItem(STYLE_STORAGE_KEY, name);
    };
    return {
      scheme,
      style,
      schemes: schemeOptions,
      styles: windowStyleOptions,
      setScheme,
      setStyle,
    };
  }, [scheme, style]);

  const theme = useMemo(() => buildTheme(scheme, style), [scheme, style]);

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeProvider");
  return value;
}
