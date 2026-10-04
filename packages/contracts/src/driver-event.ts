/** Single source of truth for driver event types: the API validates against it, the outbox queues it. */
export const DRIVER_EVENT_TYPES = [
  'SOS_ALERT',
  'ARRIVED',
  'ACKNOWLEDGEMENT',
  'ROAD_ISSUE',
  'FUEL_READING',
  'BREAK_START',
  'BREAK_END',
  'LOCATION_PING',
  /** The driver closed the SOS screen ("I'm safe"): their open SOS is resolved. */
  'SOS_CLEARED',
] as const;

export type DriverEventType = (typeof DRIVER_EVENT_TYPES)[number];

/** Minutes a driver may wait at a store before dispatch is alerted and the driver calls the store. */
export const WAIT_ALERT_MIN = 10;

/** Break time a driver has per day. A break pauses the trip until the driver ends it. */
export const BREAK_ALLOWANCE_MIN = 45;

/**
 * LOCATION_PING payload. Sent every few minutes while the trip is on the road, and every 30 s while
 * the SOS screen is open (`sos: true`, which also moves the open SOS alert's position). Closing
 * SOS stops the SOS pings.
 */
export interface LocationPingPayload {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKmh?: number | null;
  sos?: boolean;
}

/** What a ROAD_ISSUE reports. */
export const ROAD_ISSUE_KINDS = [
  'road_blocked',
  'traffic',
  'accident',
  'vehicle',
  'weather',
  'other',
] as const;
export type RoadIssueKind = (typeof ROAD_ISSUE_KINDS)[number];

export const ROAD_ISSUE_LABEL: Record<RoadIssueKind, string> = {
  road_blocked: 'Road blocked',
  traffic: 'Heavy traffic',
  accident: 'Accident',
  vehicle: 'Vehicle problem',
  weather: 'Flooding or bad weather',
  other: 'Something else',
};

/**
 * ROAD_ISSUE payload. "reported" pauses the trip's next stop until the driver sends "resolved".
 * `photo` is a small JPEG data URL taken on the phone; `location` is the phone's GPS fix, if any.
 */
export interface RoadIssuePayload {
  status: 'reported' | 'resolved';
  kind: RoadIssueKind;
  note: string | null;
  photo: string | null;
  location: { lat: number; lng: number; accuracyM: number | null } | null;
}

export type SyncRejectReason =
  | 'INVALID_EVENT'
  | 'DRIVER_MISMATCH'
  | 'FORBIDDEN_STOP'
  | 'FORBIDDEN_TRIP'
  | 'ACK_BEFORE_RECEIPT'
  /** An earlier stop's store result is not acknowledged yet, so the driver cannot arrive here. */
  | 'ACK_PENDING'
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
