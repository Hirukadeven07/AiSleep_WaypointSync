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
}
