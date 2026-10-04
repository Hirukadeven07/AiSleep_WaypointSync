import type { Brand, TripStatus } from './status';
import type { StockLevel } from './order';

/** Minutes since midnight for every *Min field. */

export type PlanOrderStatus = 'waiting' | 'deferred';

export interface PlanOrder {
  id: string;
  storeId: string;
  storeName: string;
  brand: Brand;
  district: string;
  windowOpenMin: number;
  windowCloseMin: number;
  weightKg: number;
  volumeM3: number;
  units: number;
  chilled: boolean;
  /** 0 = never moved, 1 = moved once, 2 = skipped again (repeat-skip). */
  movedCount: 0 | 1 | 2;
  /** Waiting since the previous plan day. */
  waitingSinceYesterday: boolean;
  status: PlanOrderStatus;
  /** Moved-to-later orders only. */
  deferredTo: string | null;
  deferReason: string | null;
  /** Marked urgent by the store; urgent orders head the waiting list. */
  urgent: boolean;
  stockLevel: StockLevel | null;
  urgentNote: string | null;
}

export interface PlanStop {
  id: string;
  orderId: string;
  sequence: number;
  storeName: string;
  windowOpenMin: number;
  windowCloseMin: number;
  weightKg: number;
}

/** ready/draft: unpublished, clean or with warnings. sent: published. over: over weight or volume. */
export type PlanTripState = 'ready' | 'draft' | 'sent' | 'over';

export interface PlanTrip {
  id: string;
  vehicleId: string;
  plate: string | null;
  vehicleType: 'truck' | 'van';
  vehicleTemp: 'reefer' | 'ambient';
  brand: Brand;
  district: string;
  tripNumber: number;
  status: TripStatus;
  state: PlanTripState;
  /** Stops can still be added or moved: the trip has not left the depot. A sent trip then asks the dock to accept the change. */
  editable: boolean;
  overWeight: boolean;
  overVolume: boolean;
  weightKg: number;
  weightCapKg: number;
  volumeM3: number;
  volumeCapM3: number;
  /** Planned minutes from the domain clock, null when travel or allowance rows are missing. */
  minutes: number | null;
  budgetMin: number;
  /**
   * Who drives it: the vehicle's registered driver. `driverAssigned` is true only when a trip
   * row still names a driver explicitly; the plan screen does not offer another driver.
   */
  driverId: string | null;
  driverName: string | null;
  driverAssigned: boolean;
  stops: PlanStop[];
}

/** A driver the dispatcher can put on a trip. */
export interface PlanDriver {
  id: string;
  name: string;
  /** The vehicle registered to this driver, if any. */
  vehicleId: string | null;
}

/** POST /plan/trips/:id/driver. Only the vehicle's driver is accepted. `null` follows that driver. */
export interface AssignDriverRequest {
  driverId: string | null;
}

export type LimitingResource = 'weight' | 'volume' | 'chilled' | 'vans' | 'none';

export interface PlanSummary {
  vehiclesFree: number;
  vehiclesTotal: number;
  /**
   * Planned load against the capacity of the day's trips (a vehicle on two runs counts twice),
   * by weight or volume, whichever is fuller. Can pass 100 when trips are over.
   */
  capacityUsedPct: number;
  overCount: number;
  overWhat: 'volume' | 'weight' | 'both' | null;
  /** Every order for the day, planned or still waiting. */
  orderCount: number;
  waitingCount: number;
  waitingSinceYesterday: number;
  movedToLaterCount: number;
  limitingResource: LimitingResource;
  overbooked: boolean;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  depotId: string;
  /** Orders close at this minute of the day. */
  cutoffMin: number;
  orders: PlanOrder[];
  movedToLater: PlanOrder[];
  trips: PlanTrip[];
  /** Active drivers at the depot. A trip shows the one registered on its vehicle. */
  drivers: PlanDriver[];
  districts: string[];
  summary: PlanSummary;
  /** Last send, once every trip that currently has stops has been sent. Planning can continue after this. */
  published: { at: string; tripCount: number; storeCount: number } | null;
}

export interface PlanIssue {
  code: string;
  severity: 'block' | 'warn';
  message: string;
}

export interface DropRequest {
  orderId: string;
  tripId: string;
}

/** What dropping an order on a trip would do, without saving anything. */
export interface DropCheck {
  orderId: string;
  tripId: string;
  canDrop: boolean;
  blocks: PlanIssue[];
  warnings: PlanIssue[];
  /** 1-based position the stop slots into once stops are sorted by delivery window. */
  placedSequence: number;
  after: { stopCount: number; weightKg: number; volumeM3: number; minutes: number | null };
}

export interface AssignResult {
  orderId: string;
  storeName: string;
  placedSequence: number;
  /** True when adding the stop changed the order of the stops already on the trip. */
  resorted: boolean;
  trip: PlanTrip;
  /** The trip the order was moved from, when it was already on one. */
  fromTrip: PlanTrip | null;
}

export interface UnassignResult {
  orderId: string;
  fromTrip: PlanTrip | null;
}

export interface PlanOrderLine {
  id: string;
  name: string;
  qty: number;
  pack: string;
  chilled: boolean;
}

export interface PlanOrderDetail {
  order: PlanOrder;
  /** Short reference shown in the drawer. */
  code: string;
  lines: PlanOrderLine[];
  dockType: 'rear_dock' | 'street' | 'mall_bay';
  unloadMin: number | null;
  /** Set when the order has been moved before. */
  warning: string | null;
  assignedTripId: string | null;
  suggestion: {
    tripId: string;
    label: string;
    detail: string;
    fit: string;
  } | null;
}

/** Why a dispatcher can move an order to a later day. */
export const DEFER_REASONS = [
  'No chilled space left on any trip',
  'No van left for a van-only store',
  'Delivery window missed by every trip',
  'Stock still healthy, lowest priority',
] as const;
export type DeferReason = (typeof DEFER_REASONS)[number];

export interface DeferRequest {
  orderId: string;
  reason: string;
}

/** What moving an order to a later day will do, and what the store will be told. */
export interface DeferPreview {
  orderId: string;
  storeName: string;
  /** How many times the order will have been moved, counting this one. */
  times: number;
  newDate: string; // YYYY-MM-DD
  repeatSkip: boolean;
  /** The exact text the store receives. */
  storeMessage: string;
}

export interface DeferResult {
  order: PlanOrder;
  fromTrip: PlanTrip | null;
}

export interface BringBackResult {
  order: PlanOrder;
}

export interface NewTripVehicle {
  id: string;
  label: string; // "WP-1190 · Refrigerated truck"
  detail: string; // "3,000 kg · 15 m³ · back at depot 10:20"
  tag: string | null; // "Best for Fresh"
  available: boolean;
  /** Why it cannot be chosen, e.g. "Out of service until Mon". */
  unavailable: string | null;
}

export interface NewTripOptions {
  runs: { tripNumber: 1 | 2; label: string }[];
  /** Vehicles keyed by the run they would take. */
  vehicles: Record<'1' | '2', NewTripVehicle[]>;
  /** Every district a trip can be set up for, A to Z. */
  districts: string[];
}

export interface CreateTripRequest {
  vehicleId: string;
  tripNumber: 1 | 2;
  brand: 'Fresh' | 'Style' | 'Tech';
  /** One or more district names; the first is the trip's main district. */
  districts: string[];
}

export interface RemoveTripResult {
  tripId: string;
  /** Orders that were on the trip and are waiting in the queue again. */
  ordersReturned: number;
}

/** A store the order queue's Store filter offers for the picked type and district. */
export interface PlanStore {
  id: string;
  name: string;
  brand: 'Fresh' | 'Style' | 'Tech';
  district: string;
}

export interface TripSuggestion {
  orderId: string;
  storeName: string;
  waitingSinceYesterday: boolean;
  windowOpenMin: number;
  windowCloseMin: number;
  weightKg: number;
}

export interface PublishProblem {
  tripId: string;
  trip: string; // "WP-3310 · Trip 1"
  code: string;
  message: string;
  severity: 'block' | 'warn';
}

export interface PublishCheck {
  /** Trips that will be sent (those with stops). */
  tripCount: number;
  storeCount: number;
  problems: PublishProblem[];
  /** True when nothing blocks. Warnings can still be published through. */
  canPublish: boolean;
}

export interface PlanPublishResult {
  ok: boolean;
  publishedAt: string; // ISO
  tripCount: number;
  storeCount: number;
}

export interface AutoAssignProposal {
  /** Trips on the plan once the proposal is applied. */
  tripsAfter: number;
  ordersPlaced: number;
  movedToLater: number;
  capacityUsedPct: number;
  addedToExisting: number;
  newTrips: { label: string; run: 1 | 2 }[];
  deferred: { orderId: string; storeName: string; reason: string }[];
}
