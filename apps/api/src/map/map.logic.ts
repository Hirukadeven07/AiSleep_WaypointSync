import type { LiveStatus, LocateStopKind } from '@waypoint/contracts';

/** A stop counts as visited once the driver has arrived. */
const DONE = new Set(['delivered', 'confirmed', 'partial', 'deferred']);

/** Same threshold the live day uses before a trip is called late. */
export const LATE_MIN = 5;
/** Same threshold the live day uses before an on-road trip is "Not synced". */
export const SYNC_STALE_MIN = 20;

/**
 * Used only when the district table is still empty, so the island matches the
 * planning map: the selected depot is white, the other depot is light grey,
 * and the rest of the island stays dark. A loaded district_travel.csv replaces this.
 */
export const FALLBACK_TERRITORY: Record<string, string> = {
  Puttalam: 'depo1',
  Kurunegala: 'depo1',
  Gampaha: 'depo1',
  Colombo: 'depo1',
  Kalutara: 'depo1',
  Galle: 'depo1',
  Matara: 'depo1',
  Kegalle: 'depo2',
  Kandy: 'depo2',
  Matale: 'depo2',
  'Nuwara Eliya': 'depo2',
  Ratnapura: 'depo2',
  Badulla: 'depo2',
};

export function fallbackDistricts() {
  return Object.entries(FALLBACK_TERRITORY).map(([name, depotId]) => ({
    name,
    depotId,
    served: true,
  }));
}

/** Yard positions used when a depot row has no latitude yet. */
export const DEPOT_POINT: Record<string, { lat: number; lng: number }> = {
  depo1: { lat: 6.9678, lng: 79.8832 },
  Peliyagoda: { lat: 6.9678, lng: 79.8832 },
  depo2: { lat: 7.2906, lng: 80.6337 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
};

export function depotPoint(
  id: string,
  name: string,
  coords?: { lat: number | null; lng: number | null },
) {
  if (coords?.lat != null && coords.lng != null) return { id, name, lat: coords.lat, lng: coords.lng };
  const point = DEPOT_POINT[id] ?? DEPOT_POINT[name];
  return point ? { id, name, lat: point.lat, lng: point.lng } : null;
}

/** The stop with the latest arrival. A missing arrival is not a visit. */
export function lastVisited<T extends { arrivedAt: Date | null }>(stops: T[]): T | null {
  let best: T | null = null;
  for (const stop of stops) {
    if (!stop.arrivedAt) continue;
    if (!best?.arrivedAt || stop.arrivedAt.getTime() > best.arrivedAt.getTime()) best = stop;
  }
  return best;
}

export function minutesLate(etaMin: number | null, windowCloseMin: number, done: boolean) {
  if (done || etaMin == null) return null;
  const miss = etaMin - windowCloseMin;
  return miss > 0 ? miss : null;
}

export function locateLive(input: {
  status: string;
  broke: boolean;
  allDone: boolean;
  lateMin: number;
  staleMin: number | null;
}): LiveStatus {
  const onRoad = input.status === 'on_road';
  if (input.status === 'completed' || (onRoad && input.allDone && !input.broke)) return 'completed';
  if (input.broke || input.status === 'breakdown') return 'breakdown';
  if (onRoad && input.staleMin !== null && input.staleMin >= SYNC_STALE_MIN) return 'not_synced';
  if (onRoad) return input.lateMin >= LATE_MIN ? 'late' : 'on_time';
  if (input.status === 'published') return 'assigned';
  return 'loading';
}

/** Delivered stops stay delivered. An open stop that will miss its window is at risk, ahead of "next". */
export function stopKind(status: string, late: number | null, isNext: boolean): LocateStopKind {
  if (DONE.has(status)) return 'delivered';
  if (status === 'at_risk' || (late !== null && late > 0)) return 'at_risk';
  if (isNext) return 'next';
  return 'upcoming';
}

export function isOnRoad(live: LiveStatus) {
  return live === 'on_time' || live === 'late' || live === 'breakdown' || live === 'not_synced';
}

export const stopIsDone = (status: string) => DONE.has(status);

/** The truck is drawn at its latest ping. A confirmed stop is used only when no ping has arrived. */
export function vehiclePosition(
  ping: { lat: number; lng: number } | null,
  lastStop: { lat: number | null; lng: number | null } | null,
): { lat: number; lng: number } | null {
  if (ping) return { lat: ping.lat, lng: ping.lng };
  if (lastStop?.lat != null && lastStop.lng != null) return { lat: lastStop.lat, lng: lastStop.lng };
  return null;
}
