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
}

export interface PlanLock {
  locked: boolean;
  planVersion: number;
  ackedPlanVersion: number;
  /** Orders on the acknowledged plan that the dispatcher took off this trip. */
  removed: { orderId: string; storeName: string }[];
  /** Stop ids added since the acknowledged plan. */
  added: string[];
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
