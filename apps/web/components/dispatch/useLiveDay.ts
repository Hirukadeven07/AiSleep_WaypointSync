'use client';

import type { LiveDay } from '@waypoint/contracts';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/poll';

/** Today's trips, refreshed every 5 seconds. */
export function useLiveDay() {
  const { data, error, refresh } = usePoll(() => api<LiveDay>('/dispatch/live'), 5_000);
  return { day: data, error, refresh };
}
