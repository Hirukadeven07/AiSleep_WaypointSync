'use client';

import { useEffect } from 'react';
import { preferredTheme } from '@/lib/theme-boot';

/**
 * Keeps the page light while it is shown (the landing page and sign-in screens follow the Figma,
 * which is light only), then hands back the saved or device theme when the user moves on.
 */
export function ForceLightTheme() {
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    return () => {
      document.documentElement.dataset.theme = preferredTheme();
    };
  }, []);
  return null;
}
