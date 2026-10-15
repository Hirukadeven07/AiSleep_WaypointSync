'use client';

import { useEffect, useRef } from 'react';
import type { LiveNotice } from '@waypoint/contracts';

/** Fired on this page when a notice arrives for the signed-in user. */
export const LIVE_NOTICE = 'ws:live-notice';

const claimed = new Set<string>();

/** True the first time this notice id is seen, so a poll and the live stream do not both alert. */
export function claimNotice(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

export function parseLiveNotice(raw: string): LiveNotice | null {
  try {
    const data = JSON.parse(raw) as Partial<LiveNotice>;
    if (typeof data.id !== 'string' || typeof data.title !== 'string') return null;
    return {
      id: data.id,
      title: data.title,
      body: typeof data.body === 'string' ? data.body : '',
      link: typeof data.link === 'string' ? data.link : null,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Keeps a live stream of this user's notices open. Each new one is announced once on
 * `LIVE_NOTICE`. The browser reconnects the stream on its own if it drops.
 */
export function useLiveNotices(enabled: boolean, onNotice?: (notice: LiveNotice) => void) {
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/notices/live');
    source.onmessage = (event) => {
      const notice = parseLiveNotice(event.data);
      if (!notice || !claimNotice(notice.id)) return;
      window.dispatchEvent(new CustomEvent(LIVE_NOTICE, { detail: notice }));
      onNoticeRef.current?.(notice);
    };
    return () => source.close();
  }, [enabled]);
}
