import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface PreferencesValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (t: ThemeMode) => void;
  environment: string;
  setEnvironment: (e: string) => void;
}

export const PreferencesContext = createContext<PreferencesValue | null>(null);

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) – preference lasts for this session only */
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = read('cp-theme', '');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [environment, setEnvState] = useState(() => read('cp-environment', 'all'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t);
    write('cp-theme', t);
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);
  const setEnvironment = useCallback((e: string) => {
    setEnvState(e);
    write('cp-environment', e);
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme, environment, setEnvironment }),
    [theme, toggleTheme, setTheme, environment, setEnvironment],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
