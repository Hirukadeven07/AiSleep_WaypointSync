import type { Brand, StopStatus, TripStatus } from './status';

/** Minutes since midnight for every *Min field; ISO strings for every *At field. */

/** What the dispatcher sees for a trip that is out or about to go. */
export type LiveStatus =
  'assigned' | 'loading' | 'on_time' | 'late' | 'breakdown' | 'not_synced' | 'completed';

export interface LiveStop {
  id: string;
  sequence: number;
  storeName: string;
  status: StopStatus;
  windowOpenMin: number;
  windowCloseMin: number;
  etaMin: number | null;
  /** When the driver arrived (delivered stops). */
  arrivedAt: string | null;
  /** The store confirmed receipt in its app. */
  confirmed: boolean;
  /** The store reported a problem with the goods, e.g. "1 item damaged". */
  issueNote: string | null;
  /** Minutes past the end of the window, when the current ETA misses it. */
  missBy: number | null;
}

export interface LiveTrip {
  id: string;
  vehicleId: string;
  plate: string | null;
  tripNumber: number;
  /** How many trips this vehicle has today. */
  tripsToday: number;
  brand: Brand;
  district: string;
  vehicleType: 'truck' | 'van';
  vehicleTemp: 'reefer' | 'ambient';
  driverName: string | null;
  driverPhone: string | null;
  status: TripStatus;
  live: LiveStatus;
  lateMin: number | null;
  notSyncedMin: number | null;
  stopsDone: number;
  stopsTotal: number;
  weightKg: number;
  /** Where the last update came from (the last store served) and when. */
  lastPlace: string | null;
  lastAt: string | null;
  /** When the vehicle got back to the depot (completed trips). */
  backAt: string | null;
  bay: string | null;
  /** Cartons or items the loader flagged missing. */
  missingCount: number;
  hasIssue: boolean;
  stops: LiveStop[];
}

export type AttentionKind = 'breakdown' | 'damaged' | 'missing' | 'not_synced';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  text: string;
  tripId: string;
  phone: string | null;
}

export interface LiveDay {
  date: string; // YYYY-MM-DD
  depotId: string;
  asOf: string; // ISO
  /** Earliest departure today, if any trip has left. */
  liveSince: string | null;
  kpis: {
    tripsOnRoad: number;
    dispatched: number;
    deliveriesDone: number;
    deliveriesTotal: number;
    late: number;
    avgLateMin: number;
    openIncidents: number;
    incidentsText: string;
  };
  counts: { all: number; onTime: number; late: number; issue: number; done: number };
  trips: LiveTrip[];
  attention: AttentionItem[];
  /** Orders that were moved from an earlier day and are due today. */
  carryovers: { total: number; onTrips: number; delivered: number };
  tomorrow: { date: string; ordersReceived: number; cutoffMin: number; minutesToCutoff: number };
}
