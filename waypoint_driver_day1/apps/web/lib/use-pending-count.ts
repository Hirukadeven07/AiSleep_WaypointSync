'use client';
import { useEffect, useState } from 'react';
import { getPendingCount, subscribeOutbox } from './outbox';

/** Live number of unsynced outbox actions. */
export function usePendingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getPendingCount()
        .then((n) => alive && setCount(n))
        .catch(() => {});
    refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return count;
}
