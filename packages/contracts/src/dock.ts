import type { Brand, StopStatus, TripStatus } from './status';
import type { OrderLine } from './order';

export type FlagType = 'missing' | 'damaged' | 'wrong_quantity';

export interface LoadVehicle {
  id: string;
  plate: string | null;
  type: 'truck' | 'van';
  temp: 'reefer' | 'ambient';
}

/** The dispatcher's handoff for a trip (ERD LoadingJob): bay, deadline and instructions. */
export interface LoadJob {
  bay: string | null;
  loadByTime: string | null;
  instructions: string | null;
  priority: number;
  status: 'assigned' | 'picking' | 'loaded' | 'handed_over' | 'cancelled';
}

/** One card in the loader's queue. */
export interface LoadQueueItem {
  tripId: string;
  /** YYYY-MM-DD. The queue holds today's trips and tomorrow's published plan. */
  serviceDate: string;
  /** True for a trip on a later day than today (the night shift loads tomorrow's run). */
  later: boolean;
  vehicle: LoadVehicle;
  brand: Brand;
  district: string;
  tripNumber: number;
  status: TripStatus;
  stopCount: number;
  lineCount: number;
  loaderNames: string[];
  planVersion: number;
  job: LoadJob | null;
}

export interface LoadFlagView {
  id: string;
  stopId: string;
  orderLineId: string | null;
  type: FlagType;
  qty: number | null;
  note: string | null;
}

export interface LoadStop {
  stopId: string;
  sequence: number; // delivery order, 1 = first delivered
  storeName: string;
  status: StopStatus;
  chilled: boolean;
  lines: OrderLine[];
  flags: LoadFlagView[];
  /** Added by the last acknowledged plan change; cleared when the truck departs. */
  isNew: boolean;
}

/** One order in a before/after view of a plan change. */
export interface PlanLockSlot {
  orderId: string;
  storeName: string;
  change: 'kept' | 'removed' | 'added';
}

export interface PlanLock {
  locked: boolean;
  planVersion: number;
  ackedPlanVersion: number;
  /** Orders on the acknowledged plan that the dispatcher took off this trip, with the goods to take off. */
  removed: {
    orderId: string;
    storeName: string;
    lines: OrderLine[];
    /** The loader confirmed these goods are off the truck (POST /loads/:tripId/taken-off). */
    takenOff: boolean;
  }[];
  /** Stop ids added since the acknowledged plan. */
  added: string[];
  /**
   * The acknowledged plan and the new one, both in load order (index 0 = first crate onto the
   * truck, at the back; last = nearest the door). Empty when not locked.
   */
  before: PlanLockSlot[];
  after: PlanLockSlot[];
}

/** The loader's checklist for one trip. `loadOrder[0]` is the first crate onto the truck (LIFO). */
export interface LoadSheet {
  tripId: string;
  vehicle: LoadVehicle;
  brand: Brand;
  district: string;
  tripNumber: number;
  status: TripStatus;
  planVersion: number;
  loadOrder: LoadStop[];
  session: {
    startedAt: string | null;
    departedAt: string | null;
    loaderNames: string[];
  } | null;
  lock: PlanLock;
  job: LoadJob | null;
}

export interface FlagRequest {
  stopId: string;
  orderLineId?: string;
  type: FlagType;
  qty?: number;
  note?: string;
}

export interface TakenOffRequest {
  orderId: string;
}

export interface DepartRequest {
  planVersion: number;
}

export interface DepartSummary {
  tripId: string;
  departedAt: string;
  stopCount: number;
  lineCount: number;
  flags: (LoadFlagView & {
    storeName: string;
    lineName: string | null;
    /** Every flag goes to the dispatcher as a LoaderFlag for review. */
    reviewStatus: 'pending_dispatcher' | 'approved' | 'rejected';
  })[];
}
