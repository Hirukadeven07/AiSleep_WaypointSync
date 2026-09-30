export type DriverEventType = 'arrive' | 'depart' | 'ack_plan' | 'sos' | 'delay' | 'photo' | 'note';

export interface DriverEvent {
  clientId: string; // UUID generated on the phone
  tripId: string;
  type: DriverEventType;
  payload: Record<string, unknown>;
  createdOnPhoneAt: string; // ISO timestamp
  seenPlanVersion: number;
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
  serverTime: string;
}
