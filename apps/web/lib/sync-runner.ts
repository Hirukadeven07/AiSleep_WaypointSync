'use client';
import type { SyncPushResponse } from '@waypoint/contracts';
import { getPendingActions, markActionSynced, purgeSynced, toSyncEvent } from './outbox';

const SYNC_ENDPOINT = '/api/sync';
/** POST /api/sync takes at most 100 events per call. */
const BATCH = 100;

let running: Promise<number> | null = null;

/**
 * Send queued driver actions to the server, oldest first. Every action the server answered for
 * (applied, duplicate, stale or rejected) leaves the queue; a network or server error keeps them
 * all for the next try. Resolves with how many actions the server took. Never throws.
 */
export function flushOutbox(): Promise<number> {
  running ??= push().finally(() => {
    running = null;
  });
  return running;
}

async function push(): Promise<number> {
  // Only a phone that says it is offline skips; unknown means try.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  let sent = 0;
  try {
    for (;;) {
      const pending = (await getPendingActions()).slice(0, BATCH);
      if (pending.length === 0) break;
      const res = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: pending.map(toSyncEvent) }),
      });
      if (!res.ok) break;
      const body = (await res.json()) as SyncPushResponse;
      const answered = new Set([
        ...body.applied,
        ...body.duplicate,
        ...body.rejected,
        ...(body.stale ?? []),
      ]);
      const done = pending.filter((a) => answered.has(a.clientId));
      for (const a of done) await markActionSynced(a.clientId);
      sent += done.length;
      // Nothing answered: stop rather than resend the same batch forever.
      if (done.length === 0) break;
    }
    if (sent > 0) await purgeSynced();
  } catch {
    /* offline or the server is down: the queue stays for the next try */
  }
  return sent;
}
