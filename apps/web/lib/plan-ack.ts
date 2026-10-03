'use client';
import { useCallback, useEffect, useState } from 'react';
import type { TripSummary } from './driver-cache';

/**
 * The stop list the driver last accepted, per trip, kept on the phone. When the trip's planVersion
 * goes past it, dispatch changed the plan: the driver sees what changed and must accept the new
 * list before the next action (the same lock the loader gets at the dock).
 */
export interface AckedPlan {
  version: number;
  stops: { id: string; name: string }[];
}

const key = (tripId: string) => `ws_plan_ack_${tripId}`;
const CHANGE = 'ws-plan-ack-change';

function read(tripId: string): AckedPlan | null {
  try {
    const raw = globalThis.localStorage?.getItem(key(tripId));
    return raw ? (JSON.parse(raw) as AckedPlan) : null;
  } catch {
    return null;
  }
}

function write(tripId: string, plan: AckedPlan) {
  try {
    globalThis.localStorage?.setItem(key(tripId), JSON.stringify(plan));
  } catch {
    /* blocked storage: the lock cannot be remembered, so it is not shown */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE));
}

export const snapshot = (trip: TripSummary): AckedPlan => ({
  version: trip.planVersion,
  stops: [...trip.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => ({ id: String(s.id), name: s.outletName })),
});

export interface PlanLock {
  locked: boolean;
  /** Stops on the new plan that were not on the accepted one. */
  added: string[];
  /** Stops taken off since the accepted plan. */
  removed: string[];
  accept: () => void;
}

/** What changed since the accepted plan; locked only when the trip's planVersion moved past it. */
export function planChange(
  acked: AckedPlan | null,
  trip: TripSummary | null,
): Omit<PlanLock, 'accept'> {
  if (!trip || !acked || trip.planVersion <= acked.version) {
    return { locked: false, added: [], removed: [] };
  }
  const now = snapshot(trip).stops;
  const before = new Set(acked.stops.map((s) => s.id));
  const after = new Set(now.map((s) => s.id));
  return {
    locked: true,
    added: now.filter((s) => !before.has(s.id)).map((s) => s.name),
    removed: acked.stops.filter((s) => !after.has(s.id)).map((s) => s.name),
  };
}

export function usePlanLock(trip: TripSummary | null): PlanLock {
  const [acked, setAcked] = useState<AckedPlan | null>(null);
  const tripId = trip ? String(trip.id) : null;

  useEffect(() => {
    if (!tripId) return;
    const sync = () => setAcked(read(tripId));
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener('storage', sync);
    };
  }, [tripId]);

  // The first time the phone sees a trip, that plan counts as accepted.
  useEffect(() => {
    if (trip && tripId && !read(tripId)) write(tripId, snapshot(trip));
  }, [trip, tripId]);

  const accept = useCallback(() => {
    if (trip && tripId) write(tripId, snapshot(trip));
  }, [trip, tripId]);

  return { ...planChange(acked, trip), accept };
}
