'use client';
import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY } from './theme-boot';

export type Theme = 'light' | 'dark';

function current(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** The page's theme and a setter that applies it at once, saves it, and tells other tabs. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(current());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY || (e.newValue !== 'light' && e.newValue !== 'dark')) return;
      document.documentElement.dataset.theme = e.newValue;
      setThemeState(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the theme holds until the page reloads */
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
