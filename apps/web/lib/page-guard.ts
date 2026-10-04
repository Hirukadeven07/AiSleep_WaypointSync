// Plain module (no 'use client'): the root layout, a server component, inlines the script.

/**
 * A page restored from the browser's back-forward cache comes back with its old content and
 * timers, so after signing out, Back would show the app until its next request failed. Reloading
 * on such a restore asks the server again, which sends a signed-out visitor to sign in at once.
 */
export const BACK_CACHE_GUARD_SCRIPT = `window.addEventListener('pageshow',function(e){if(e.persisted)window.location.reload()})`;
