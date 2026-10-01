import type { Brand, TripStatus } from './status';

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
  overWeight: boolean;
  overVolume: boolean;
  weightKg: number;
  weightCapKg: number;
  volumeM3: number;
  volumeCapM3: number;
  /** Planned minutes from the domain clock, null when travel or allowance rows are missing. */
  minutes: number | null;
  budgetMin: number;
  stops: PlanStop[];
}

export type LimitingResource = 'weight' | 'volume' | 'chilled' | 'vans' | 'none';

export interface PlanSummary {
  vehiclesFree: number;
  vehiclesTotal: number;
  /** Planned weight against the capacity of the vehicles that have a trip. */
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
  districts: string[];
  summary: PlanSummary;
  /** Set once every trip with stops has been sent to loaders and drivers. */
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
  districts: { id: string; name: string }[];
}

export interface CreateTripRequest {
  vehicleId: string;
  tripNumber: 1 | 2;
  brand: 'Fresh' | 'Style' | 'Tech';
  districtId: string;
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
