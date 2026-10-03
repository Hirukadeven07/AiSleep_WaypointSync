'use client';
import { useEffect } from 'react';
import type { TripSummary } from './driver-cache';
import { enqueueAction } from './outbox';

/** How often the phone records its position while the trip is on the road. */
export const ROAD_PING_MS = 2 * 60_000;

/**
 * While the active trip is on the road, queue the phone's position every two minutes as a
 * LOCATION_PING. Pings go through the outbox like every other action, so a stretch with no
 * signal fills in on the dispatch board once the phone reconnects.
 */
export function useRoadPings(trip: TripSummary | null, enabled: boolean) {
  const tripId = trip ? String(trip.id) : null;
  const onRoad = enabled && trip?.status === 'on_road';
  const planVersion = trip?.planVersion ?? null;

  useEffect(() => {
    if (!onRoad || !tripId) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    const ping = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy, speed } = pos.coords;
          void enqueueAction(
            'LOCATION_PING',
            {
              lat: latitude,
              lng: longitude,
              accuracyM: Number.isFinite(accuracy) ? accuracy : null,
              speedKmh: speed != null && Number.isFinite(speed) ? speed * 3.6 : null,
            },
            tripId,
            planVersion,
          ).catch(() => {});
        },
        () => {
          /* no fix or location blocked: try again next time */
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
      );
    ping();
    const timer = setInterval(ping, ROAD_PING_MS);
    return () => clearInterval(timer);
  }, [onRoad, tripId, planVersion]);
}
