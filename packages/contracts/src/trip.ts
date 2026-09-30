import type { Brand, StopStatus, TripStatus } from './status';
import type { OrderLine } from './order';

export interface TripStop {
  id: string;
  sequence: number;
  storeId: string;
  storeName: string;
  orderId: string;
  status: StopStatus;
  etaMin: number | null; // minutes since midnight
  windowOpenMin: number;
  windowCloseMin: number;
  units: number;
  weightKg: number;
  volumeM3: number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  depotId: string;
  brand: Brand;
  districtId: string;
  serviceDate: string; // YYYY-MM-DD
  tripNumber: 1 | 2;
  status: TripStatus;
  planVersion: number;
  plannedMinutes: number | null;
  plannedLitres: number | null;
  stops: TripStop[];
}

export interface TripDrawerPayload {
  trip: Trip;
  vehicle: {
    id: string;
    plate: string | null;
    type: 'truck' | 'van';
    temp: 'reefer' | 'ambient';
    weightCapKg: number;
    volumeCapM3: number;
  };
  loadPercent: { weight: number; volume: number };
  driverName: string | null;
  lines: Record<string, OrderLine[]>; // keyed by stop id
}
