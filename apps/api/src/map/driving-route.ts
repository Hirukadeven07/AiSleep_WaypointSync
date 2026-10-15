import { distanceM } from './map.logic';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
/** Used when the road router cannot be reached. 30 km/h is a slow island average. */
const FALLBACK_KMH = 30;

export type LngLat = [number, number];

export interface DrivingLeg {
  minutes: number;
  /** Empty when the router did not return a road path. */
  line: LngLat[];
}

export function fallbackMinutes(points: { lat: number; lng: number }[]): number {
  let metres = 0;
  for (let i = 1; i < points.length; i++) metres += distanceM(points[i - 1], points[i]);
  return Math.max(1, Math.round(metres / 1000 / FALLBACK_KMH * 60));
}

/** Pulls duration and the road line out of an OSRM JSON body. */
export function parseOsrm(body: unknown): DrivingLeg | null {
  if (!body || typeof body !== 'object') return null;
  const routes = (body as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const route = routes[0] as {
    duration?: unknown;
    geometry?: { coordinates?: unknown };
  };
  if (typeof route.duration !== 'number' || !Number.isFinite(route.duration)) return null;
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const line: LngLat[] = [];
  for (const pair of coords) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const lng = pair[0];
    const lat = pair[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    line.push([lng, lat]);
  }
  return { minutes: Math.max(1, Math.round(route.duration / 60)), line };
}

/**
 * Road path through `points` in order. Duration falls back to a straight-line estimate
 * when the router is down; `line` is then empty so the map does not pretend it is a road.
 */
export async function drivingRoute(
  points: { lat: number; lng: number }[],
): Promise<DrivingLeg | null> {
  if (points.length < 2) return null;
  const path = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM}/${path}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { minutes: fallbackMinutes(points), line: [] };
    const parsed = parseOsrm(await res.json());
    return parsed ?? { minutes: fallbackMinutes(points), line: [] };
  } catch {
    return { minutes: fallbackMinutes(points), line: [] };
  }
}
