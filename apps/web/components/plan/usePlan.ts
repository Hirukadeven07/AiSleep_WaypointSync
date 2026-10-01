'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlanDay } from '@waypoint/contracts';
import { api } from '@/lib/api';

/** Loads the plan board for tomorrow. `reload` re-reads it after a change. */
export function usePlan() {
  const [plan, setPlan] = useState<PlanDay | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPlan(await api<PlanDay>('/plan'));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { plan, error, reload };
}
