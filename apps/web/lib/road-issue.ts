'use client';
import { useEffect, useState } from 'react';
import type { RoadIssueKind } from '@waypoint/contracts';

/**
 * The road issue this phone reported and has not resolved, per trip. Kept on the phone so the
 * pause holds with no signal and survives a reload; the server hears about it through the outbox.
 */
export interface OpenRoadIssue {
  kind: RoadIssueKind;
  note: string | null;
  reportedAt: string; // ISO
}

const key = (tripId: string) => `ws_road_issue_${tripId}`;
const CHANGE = 'ws-road-issue-change';

export function readRoadIssue(tripId: string): OpenRoadIssue | null {
  try {
    const raw = globalThis.localStorage?.getItem(key(tripId));
    return raw ? (JSON.parse(raw) as OpenRoadIssue) : null;
  } catch {
    return null;
  }
}

export function writeRoadIssue(tripId: string, issue: OpenRoadIssue | null): void {
  try {
    if (issue) globalThis.localStorage?.setItem(key(tripId), JSON.stringify(issue));
    else globalThis.localStorage?.removeItem(key(tripId));
  } catch {
    /* blocked storage: the pause lasts for this visit only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE));
}

/** The open road issue for a trip, kept in step across screens. */
export function useRoadIssue(tripId: string | undefined): OpenRoadIssue | null {
  const [issue, setIssue] = useState<OpenRoadIssue | null>(null);
  useEffect(() => {
    if (!tripId) return;
    const read = () => setIssue(readRoadIssue(tripId));
    read();
    window.addEventListener(CHANGE, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(CHANGE, read);
      window.removeEventListener('storage', read);
    };
  }, [tripId]);
  return issue;
}
