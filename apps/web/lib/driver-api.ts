import type { DriverDay, Me } from './driver-cache';

/** Thrown when the session is missing or expired (HTTP 401). Network failures are NOT AuthErrors. */
export class AuthError extends Error {}

export async function fetchMe(): Promise<Me> {
  const res = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 401 || res.status === 403) throw new AuthError('Not signed in');
  if (!res.ok) throw new Error(`/api/me failed with ${res.status}`);
  return (await res.json()) as Me;
}

export async function login(loginId: string, secret: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'driver', loginId, secret }),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError('Wrong ID or PIN');
  if (!res.ok) throw new Error(`Login failed with ${res.status}`);
}

/**
 * ASSUMED ENDPOINT. The trips API (Yohan, day 2) has no driver route yet.
 * Expected to return the vehicle with Vehicle.driverId = me.id and that driver's trips for
 * today. Change this one constant when the real path is agreed. A 404 means "not built yet".
 */
export const DRIVER_DAY_ENDPOINT = '/api/driver/day';

export async function fetchDriverDay(): Promise<DriverDay | null> {
  const res = await fetch(DRIVER_DAY_ENDPOINT, { credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 401 || res.status === 403) throw new AuthError('Not signed in');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${DRIVER_DAY_ENDPOINT} failed with ${res.status}`);
  return (await res.json()) as DriverDay;
}
