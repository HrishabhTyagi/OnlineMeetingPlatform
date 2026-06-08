import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../services/storage';
import { palettes, SamvaadPalette, ThemeName } from '../theme/theme';

interface ThemeContextValue {
  themeName: ThemeName;
  palette: SamvaadPalette;
  isDark: boolean;
  setThemeName: (themeName: ThemeName) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setName] = useState<ThemeName>('classic');

  useEffect(() => {
    storage.getThemeName().then((saved) => {
      if (saved === 'classic' || saved === 'focus') {
        setName(saved);
      }
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    themeName,
    palette: palettes[themeName],
    isDark: themeName === 'focus',
    setThemeName: async (next) => {
      setName(next);
      await storage.setThemeName(next);
    },
  }), [themeName]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useThemePreference must be used inside ThemeProvider');
  }

  return value;
}
