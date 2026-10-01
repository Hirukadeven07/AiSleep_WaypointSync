'use client';

import type { LiveDay } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';

/** Today's trips, refreshed every 30 seconds. */
export function useLiveDay() {
  const { data, error, refresh } = usePoll(() => api<LiveDay>('/dispatch/live'), 30_000);
  return { day: data, error, refresh };
}
