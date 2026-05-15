import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';

export type SamvaadTheme = 'classic' | 'focus';

export const SAMVAAD_THEMES: Array<{
  id: SamvaadTheme;
  label: string;
  description: string;
  swatches: string[];
}> = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Bright workspace for everyday collaboration.',
    swatches: ['#ffffff', '#eef2ff', '#4f46e5'],
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Dark, low-glare workspace for long calls and chat.',
    swatches: ['#0f172a', '#1e293b', '#38bdf8'],
  },
];

interface ThemeContextValue {
  theme: SamvaadTheme;
  setTheme: (theme: SamvaadTheme) => void;
}

const DEFAULT_THEME: SamvaadTheme = 'classic';
const GLOBAL_THEME_KEY = 'samvaadTheme';
const USER_THEME_PREFIX = 'samvaadTheme:';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(value?: string | null): SamvaadTheme {
  return SAMVAAD_THEMES.some((theme) => theme.id === value)
    ? value as SamvaadTheme
    : DEFAULT_THEME;
}

function themeKeyForUser(userId?: string) {
  return userId ? `${USER_THEME_PREFIX}${userId}` : GLOBAL_THEME_KEY;
}

function readTheme(userId?: string): SamvaadTheme {
  try {
    const userTheme = userId ? localStorage.getItem(themeKeyForUser(userId)) : null;
    return normalizeTheme(userTheme || localStorage.getItem(GLOBAL_THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function writeTheme(theme: SamvaadTheme, userId?: string) {
  try {
    localStorage.setItem(GLOBAL_THEME_KEY, theme);
    if (userId) {
      localStorage.setItem(themeKeyForUser(userId), theme);
    }
  } catch {
    // Ignore storage failures; the live theme still updates for the current session.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((state) => state.user?.id);
  const [theme, setThemeState] = useState<SamvaadTheme>(() => readTheme(useAuthStore.getState().user?.id));

  useEffect(() => {
    setThemeState(readTheme(userId));
  }, [userId]);

  useEffect(() => {
    document.documentElement.dataset.samvaadTheme = theme;
    document.documentElement.style.colorScheme = theme === 'focus' ? 'dark' : 'light';
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: (nextTheme) => {
      const normalized = normalizeTheme(nextTheme);
      setThemeState(normalized);
      writeTheme(normalized, userId);
    },
  }), [theme, userId]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useSamvaadTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useSamvaadTheme must be used inside ThemeProvider');
  }

  return context;
}
