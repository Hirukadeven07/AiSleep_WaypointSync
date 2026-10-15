// Plain module (no 'use client'): the root layout, a server component, inlines the script.

/** Where the choice is kept on this device. No choice yet means "follow the phone or computer". */
export const THEME_KEY = 'ws-theme';

/**
 * The landing page and the sign-in screens are always light, as in the Figma
 * (the regex is inlined into the boot script, so keep it plain).
 */
export const LIGHT_ONLY_PATHS = '^/(login(/|$)|$)';

/**
 * Runs in <head> before the page paints, so a saved dark theme never flashes light first.
 * Kept as a string because it is inlined into the root layout.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(new RegExp('${LIGHT_ONLY_PATHS}').test(location.pathname)){t='light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}`;

/** The theme the rest of the app should use: the saved choice, else the device setting. */
export function preferredTheme(): 'light' | 'dark' {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* storage blocked: fall back to the device setting */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
