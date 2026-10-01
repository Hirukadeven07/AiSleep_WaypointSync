/**
 * Offline fallback for the driver shell.
 * On every successful load we save the session and the day's trips here, so a reload
 * with no signal still renders the last known state.
 *
 * TODO: swap the trip types for imports from `@waypoint/contracts` once the
 * trips contract is merged there. `Me` already comes from contracts.
 */
export type EntityId = string | number;

/** GET /api/me */
export type { Me } from '@waypoint/contracts';
import type { Me } from '@waypoint/contracts';

export interface StopSummary {
  id: EntityId;
  sequence: number;
  outletName: string;
  address?: string;
  status: string;
  windowStart?: number; // minutes since midnight
  windowEnd?: number;
  eta?: number;
}

export interface TripSummary {
  id: EntityId;
  tripNumber: 1 | 2;
  status: string;
  planVersion: number; // Trip.planVersion, sent as seenPlanVersion on every action
  stops: StopSummary[];
}

export interface VehicleSummary {
  id: EntityId;
  plate: string; // Vehicle linked by Vehicle.driverId = me.id
  type: string;
}

export interface DriverDay {
  vehicle: VehicleSummary | null;
  trips: TripSummary[];
}

export interface ShellCache {
  me: Me;
  day: DriverDay | null;
  cachedAt: string; // ISO
}

const KEY = 'ws_driver_shell_v1';

export function readCachedShell(): ShellCache | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShellCache) : null;
  } catch {
    return null;
  }
}

export function readCachedMe(): Me | null {
  return readCachedShell()?.me ?? null;
}

export function writeCachedShell(value: Omit<ShellCache, 'cachedAt'>): ShellCache {
  const entry: ShellCache = { ...value, cachedAt: new Date().toISOString() };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* storage full or blocked: the shell still works, just without offline fallback */
  }
  return entry;
}

export function clearCachedShell(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The trip the driver is working on: first one that is published and not finished. */
export function pickActiveTrip(day: DriverDay | null): TripSummary | null {
  if (!day) return null;
  // ASSUMPTION: status names. Adjust once the Trip status enum is final.
  const done = new Set(['DRAFT', 'COMPLETED', 'CANCELLED']);
  return (
    [...day.trips]
      .sort((a, b) => a.tripNumber - b.tripNumber)
      .find((t) => !done.has(t.status)) ?? null
  );
}
