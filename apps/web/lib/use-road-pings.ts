'use client';
import { useEffect } from 'react';
import type { TripSummary } from './driver-cache';
import { enqueueAction } from './outbox';

/** How often the phone sends its position while the trip is on the road. */
export const ROAD_PING_MS = 1_000;

/**
 * While the active trip is on the road, follow the phone's GPS and queue its newest position every
 * second as a LOCATION_PING (only when there is a new fix, so a phone without one sends nothing).
 * Pings go through the outbox like every other action, so a stretch with no signal fills in on
 * the dispatch board once the phone reconnects.
 */
export function useRoadPings(trip: TripSummary | null, enabled: boolean) {
  const tripId = trip ? String(trip.id) : null;
  const onRoad = enabled && trip?.status === 'on_road';
  const planVersion = trip?.planVersion ?? null;

  useEffect(() => {
    if (!onRoad || !tripId) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    let latest: GeolocationPosition | null = null;
    let sentAt = 0;
    // A one-off position request per second would often time out; watching keeps the GPS on and
    // hands over every new fix as it comes.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest = pos;
      },
      () => {
        /* no fix or location blocked: keep the last one */
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
    const send = () => {
      if (!latest || latest.timestamp === sentAt) return;
      sentAt = latest.timestamp;
      const { latitude, longitude, accuracy, speed } = latest.coords;
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
    };
    const timer = setInterval(send, ROAD_PING_MS);
    return () => {
      clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [onRoad, tripId, planVersion]);
}
