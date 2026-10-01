/** Single source of truth for driver event types: the API validates against it, the outbox queues it. */
export const DRIVER_EVENT_TYPES = [
  'SOS_ALERT',
  'ARRIVED',
  'ACKNOWLEDGEMENT',
  'ROAD_ISSUE',
  'FUEL_READING',
] as const;

export type DriverEventType = (typeof DRIVER_EVENT_TYPES)[number];

export type SyncRejectReason =
  | 'INVALID_EVENT'
  | 'DRIVER_MISMATCH'
  | 'FORBIDDEN_STOP'
  | 'FORBIDDEN_TRIP'
  | 'ACK_BEFORE_RECEIPT'
  | 'NO_ACTIVE_TRIP'
  | 'NO_VEHICLE'
  | 'INVALID_PAYLOAD';

export interface DriverEventInput {
  clientId: string;
  driverId: string;
  tripId: string | null;
  type: DriverEventType;
  payload: Record<string, unknown>;
  createdOnPhoneAt: string;
  seenPlanVersion: number | null;
}

/** @deprecated Use DriverEventInput — kept so older imports still type-check. */
export type DriverEvent = DriverEventInput;

export interface SyncPushRequest {
  events: DriverEventInput[];
}

export interface SyncPushResponse {
  applied: string[];
  duplicate: string[];
  rejected: string[];
  stale?: string[];
  rejectedReasons?: Record<string, SyncRejectReason>;
}

export interface SyncPullStop {
  id: string;
  sequence: number;
  status: string;
  arrivedAt: string | null;
  storeConfirmedAt: string | null;
  driverAckAt: string | null;
}

export interface SyncPullResponse {
  tripId: string | null;
  planVersion: number | null;
  stops: SyncPullStop[];
  activeSos: boolean;
}
