'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'ejo-theme';

/**
 * Provides theme state to the tree. The initial class on <html> is set
 * synchronously by an inline script in app/layout.tsx (before hydration)
 * to avoid a flash of the wrong theme — this provider just reads that
 * same class back into React state on mount so toggleTheme stays in sync.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    // Until the customer picks a theme, follow the device as it changes
    // (a phone switching to dark at sunset), not only on the first load.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      let chosen: string | null = null;
      try { chosen = window.localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
      if (chosen) return;
      document.documentElement.classList.toggle('dark', media.matches);
      setTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked: the choice lasts this visit */ }
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
