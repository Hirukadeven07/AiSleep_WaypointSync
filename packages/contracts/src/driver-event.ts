export type DriverEventType =
  | 'SOS_ALERT'
  | 'ARRIVED'
  | 'ACKNOWLEDGEMENT'
  | 'ROAD_ISSUE'
  | 'FUEL_READING';

export interface DriverEventInput {
  clientId: string;
  driverId: string;
  tripId: string | null;
  type: DriverEventType;
  payload: Record<string, unknown>;
  createdOnPhoneAt: string;
  seenPlanVersion: number | null;
}

export interface SyncPushRequest {
  events: DriverEventInput[];
}

export interface SyncPushResponse {
  applied: string[];
  duplicate: string[];
  rejected: string[];
  stale?: string[];
  rejectedReasons?: Record<string, string>;
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
