// Plain module (no 'use client'): the root layout, a server component, inlines the script.

/** Where the choice is kept on this device. No choice yet means "follow the phone or computer". */
export const THEME_KEY = 'ws-theme';

/**
 * Runs in <head> before the page paints, so a saved dark theme never flashes light first.
 * Kept as a string because it is inlined into the root layout.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}`;
