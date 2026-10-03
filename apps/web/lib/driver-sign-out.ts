import { clearCachedShell } from './driver-cache';
import { logout } from './session';

/**
 * Signs the driver out and goes to the main page. The saved shell (session and trips) is dropped
 * so a reload cannot show the last driver's day; unsent events stay in the outbox.
 */
export async function signOutDriver() {
  clearCachedShell();
  await logout('/');
}
