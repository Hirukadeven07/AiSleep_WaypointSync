import type { Brand, TripStatus } from './status';

export type FleetStatus = 'on_road' | 'breakdown' | 'at_depot' | 'out_of_service';

/** Why a vehicle can be taken out of service. */
export const OUT_OF_SERVICE_REASONS = [
  'Brake service',
  'Tyre replacement',
  'Fridge unit repair',
  'Engine repair',
  'Awaiting insurance claim',
  'Other',
] as const;

export interface FleetTrip {
  id: string;
  tripNumber: number;
  brand: Brand;
  district: string;
  status: TripStatus;
  /** What the chip says: "Late 25 min", "On time", "Planned" ... */
  label: string;
  tone: 'on_time' | 'late' | 'breakdown' | 'not_synced' | 'completed' | 'planned';
  stopsDone: number;
  stopsTotal: number;
}

export interface FleetVehicle {
  id: string;
  plate: string;
  driverName: string | null;
  driverPhone: string | null;
  type: 'truck' | 'van';
  temp: 'reefer' | 'ambient';
  weightCapKg: number;
  volumeCapM3: number;
  homeDepot: string;
  status: FleetStatus;
  /** The "Today" column: "Trip 1 of 2 · 5/8 delivered". */
  today: string;
  /** Why it is out of service. Set only while status is out_of_service. */
  outOfServiceReason: string | null;
  /** ISO-8601 date and time it is expected back. Null when no return time is known. */
  returnDate: string | null;
  trips: FleetTrip[];
  /** Trips that have not started (planned or assigned): they go back to Planning if the vehicle is taken out. */
  plannedTrips: { tripNumber: number; stops: number }[];
  /** Fuel used this week against the weekly quota, estimated from the planned routes. */
  fuel: { usedL: number; quotaL: number; pct: number } | null;
}

export interface FleetDay {
  date: string;
  depotId: string;
  vehicles: FleetVehicle[];
  counts: { all: number; onRoad: number; atDepot: number; outOfService: number };
}

/** Fleet "Add vehicle": a new vehicle at the dispatcher's depot. The plate becomes its id. */
export interface AddVehicleRequest {
  plate: string; // "WP-1234" or "WP LB-1234"
  type: 'truck' | 'van';
  temp: 'reefer' | 'ambient';
  weightCapKg: number;
  volumeCapM3: number;
  kmPerL?: number;
  weeklyFuelQuotaL?: number;
}

export interface OutOfServiceRequest {
  reason: string;
  /** ISO-8601 with a time, for example 2031-07-11T14:30:00+05:30. Omit when unknown. */
  returnDate?: string;
  note?: string;
}

export interface OutOfServiceResult {
  vehicle: FleetVehicle;
  /** Planned trips that were taken apart, and the orders that went back to the plan. */
  tripsReturned: number;
  ordersReturned: number;
}
