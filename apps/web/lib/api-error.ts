import type { ReasonCode } from '@waypoint/contracts';
import { ApiError } from './api';

/** Reason code from a 409 domain error ({ reason, message }), if there is one. */
export function reasonOf(e: unknown): ReasonCode | undefined {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'reason' in e.body) {
    return (e.body as { reason: ReasonCode }).reason;
  }
  return undefined;
}

/** A sentence to show the user for a failed request. */
export function messageOf(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'message' in e.body) {
    const m = (e.body as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  }
  if (e instanceof TypeError) return 'No connection. Check the signal and try again.';
  return fallback;
}
