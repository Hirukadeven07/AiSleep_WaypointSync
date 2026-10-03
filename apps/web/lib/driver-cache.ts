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
import type { DriverDayResponse, Me } from '@waypoint/contracts';

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
  serviceDate?: string; // YYYY-MM-DD
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
  serviceDate?: string; // YYYY-MM-DD, today in Asia/Colombo
  vehicle: VehicleSummary | null;
  trips: TripSummary[];
  /** The server's pick (on_road, else the lowest trip number). */
  activeTripId?: EntityId | null;
  /** Published trips on the next few days. */
  upcoming?: TripSummary[];
  unreadNotices?: number;
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

/**
 * The shell saves the whole GET /api/driver/day body (phones, loader flags, notes and all);
 * `DriverDay` above only names the fields the shell itself reads. This reads it with its real type.
 */
export const fullDay = (day: DriverDay | null) => day as unknown as DriverDayResponse | null;

/** The trip the driver is working on: the server's pick, else the first one not finished. */
export function pickActiveTrip(day: DriverDay | null): TripSummary | null {
  if (!day) return null;
  const picked = day.activeTripId != null ? day.trips.find((t) => t.id === day.activeTripId) : null;
  if (picked) return picked;
  const done = new Set(['planning', 'completed', 'breakdown']);
  return (
    [...day.trips]
      .sort((a, b) => a.tripNumber - b.tripNumber)
      .find((t) => !done.has(t.status)) ?? null
  );
}
