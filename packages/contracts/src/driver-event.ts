export type DriverEventType =
  | 'ARRIVED'
  | 'WAITING'
  | 'ACKNOWLEDGEMENT'
  | 'ROAD_ISSUE'
  | 'SOS_ALERT';

export interface DriverEvent {
  clientId: string; // UUID generated on the phone; unique on the server
  driverId?: string;
  tripId: string | null; // null = SOS (or similar) with no active trip
  type: DriverEventType;
  payload: Record<string, unknown>;
  createdOnPhoneAt: string; // ISO timestamp
  seenPlanVersion: number | null;
}

export interface SyncPushRequest {
  events: DriverEvent[];
}

export interface SyncPushResult {
  clientId: string;
  status: 'applied' | 'duplicate' | 'rejected';
  reason?: string;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
  /** clientIds that were already stored; rest of the batch still applied */
  duplicate: string[];
  serverTime: string;
}
