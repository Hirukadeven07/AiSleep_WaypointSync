'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DriverEventType, SyncRejectReason } from '@waypoint/contracts';

/**
 * Actions the server refused on sync. They leave the outbox (resending would be refused again),
 * so they are kept here until the driver has seen them.
 */
export interface RejectedAction {
  clientId: string;
  type: DriverEventType;
  reason: SyncRejectReason | 'UNKNOWN';
  at: string; // when it was refused
}

const KEY = 'ws_sync_rejected_v1';
const CHANGE = 'ws-sync-rejected-change';
const KEEP = 20;

function read(): RejectedAction[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as RejectedAction[]) : [];
  } catch {
    return [];
  }
}

function write(list: RejectedAction[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    /* blocked storage: the refusal is not remembered */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE));
}

export function recordRejected(items: RejectedAction[]) {
  if (items.length > 0) write([...read(), ...items]);
}

/** GPS pings are background noise; a refused ping is not worth the driver's attention. */
const QUIET: ReadonlySet<DriverEventType> = new Set(['LOCATION_PING']);

const ACTION: Partial<Record<DriverEventType, string>> = {
  ARRIVED: '"I\'ve arrived"',
  ACKNOWLEDGEMENT: 'Your acknowledgement',
  ROAD_ISSUE: 'Your road issue report',
  SOS_ALERT: 'Your SOS',
  FUEL_READING: 'Your fuel reading',
  BREAK_START: 'Your break start',
  BREAK_END: 'Your break end',
};

const WHY: Record<RejectedAction['reason'], string> = {
  ACK_BEFORE_RECEIPT: 'the store had not checked the goods yet',
  ACK_PENDING: 'the store result at an earlier stop was not acknowledged',
  FORBIDDEN_STOP: 'that stop is no longer on your trip',
  FORBIDDEN_TRIP: 'that trip is no longer yours',
  NO_ACTIVE_TRIP: 'you have no trip today',
  NO_VEHICLE: 'no vehicle is linked to you',
  DRIVER_MISMATCH: 'it was saved by another driver on this phone',
  INVALID_PAYLOAD: 'some details were missing or wrong',
  INVALID_EVENT: 'the app sent something the server did not understand',
  UNKNOWN: 'the server refused it',
};

export function rejectedText(r: RejectedAction): string {
  return `${ACTION[r.type] ?? 'An action'} was not saved: ${WHY[r.reason] ?? WHY.UNKNOWN}.`;
}

/** Refused actions the driver has not dismissed yet. */
export function useRejected() {
  const [list, setList] = useState<RejectedAction[]>([]);
  useEffect(() => {
    const sync = () => setList(read().filter((r) => !QUIET.has(r.type)));
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const dismiss = useCallback(() => write([]), []);
  return { rejected: list, dismiss };
}
