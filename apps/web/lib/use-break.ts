'use client';
import { useCallback, useEffect, useState } from 'react';
import { BREAK_ALLOWANCE_MIN } from '@waypoint/contracts';
import { useDriver } from '@/components/drive/DriverShell';
import { fullDay } from './driver-cache';
import { enqueueAction, getPendingActions, subscribeOutbox } from './outbox';

type BreakEvent = { type: 'BREAK_START' | 'BREAK_END'; at: number };

/**
 * The driver's break today: the server's state from GET /driver/day, then any break taps still
 * waiting in the outbox on top, so starting or ending a break shows at once, also offline.
 */
export function useBreak() {
  const { day, trip } = useDriver();
  const server = fullDay(day)?.break;
  const [pending, setPending] = useState<BreakEvent[]>([]);

  useEffect(() => {
    let alive = true;
    const read = () =>
      getPendingActions()
        .then((list) => {
          if (!alive) return;
          setPending(
            list
              .filter((a) => a.type === 'BREAK_START' || a.type === 'BREAK_END')
              .map((a) => ({
                type: a.type as BreakEvent['type'],
                at: Date.parse(a.createdOnPhoneAt),
              })),
          );
        })
        .catch(() => {});
    read();
    const unsubscribe = subscribeOutbox(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  let since = server?.onBreakSince ? Date.parse(server.onBreakSince) : null;
  let usedMs = (server?.usedMin ?? 0) * 60_000;
  for (const e of pending) {
    if (e.type === 'BREAK_START') since ??= e.at;
    else if (since !== null) {
      usedMs += Math.max(0, e.at - since);
      since = null;
    }
  }

  const tripId = trip?.id ?? null;
  const planVersion = trip?.planVersion ?? null;
  const start = useCallback(
    () => enqueueAction('BREAK_START', {}, tripId, planVersion),
    [tripId, planVersion],
  );
  const end = useCallback(
    () => enqueueAction('BREAK_END', {}, tripId, planVersion),
    [tripId, planVersion],
  );

  return {
    onBreakSince: since,
    usedMin: Math.round(usedMs / 60_000),
    allowanceMin: server?.allowanceMin ?? BREAK_ALLOWANCE_MIN,
    start,
    end,
  };
}

/** Milliseconds now, ticking once a second while `on`. */
export function useTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
