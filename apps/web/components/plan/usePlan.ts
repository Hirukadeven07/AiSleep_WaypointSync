'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlanDay } from '@waypoint/contracts';
import { api } from '@/lib/api';

/** Loads the plan board for one day. With no date, the API returns tomorrow. */
export function usePlan(date?: string) {
  const [plan, setPlan] = useState<PlanDay | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : '';
      setPlan(await api<PlanDay>(`/plan${qs}`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { plan, error, reload };
}
