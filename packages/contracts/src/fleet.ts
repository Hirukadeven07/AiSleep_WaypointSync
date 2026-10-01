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
  /** "Brake service" and the date it is expected back, for a vehicle out of service. */
  outOfServiceReason: string | null;
  returnDate: string | null; // YYYY-MM-DD
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

export interface OutOfServiceRequest {
  reason: string;
  returnDate: string; // YYYY-MM-DD
  note?: string;
}

export interface OutOfServiceResult {
  vehicle: FleetVehicle;
  /** Planned trips that were taken apart, and the orders that went back to the plan. */
  tripsReturned: number;
  ordersReturned: number;
}
