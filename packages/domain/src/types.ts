/**
 * Engine input types. Nest maps Prisma rows into these, then calls domain.
 * HTTP payloads stay in @waypoint/contracts. Domain never imports Prisma.
 */
import type { ReasonCode } from '@waypoint/contracts';

export type Brand = 'Fresh' | 'Style' | 'Tech';
export type Depot = 'Peliyagoda' | 'Kandy';
export type VehicleType = 'truck' | 'van';
export type TempClass = 'reefer' | 'ambient';
export type DockType = 'rear_dock' | 'street' | 'mall_bay';
export type ParkingConstraint = 'van_only' | 'normal';

/** One row from district_travel.csv. Times are free-flow, not traffic-adjusted. */
export type TravelLeg = {
  district: string;
  depot: Depot;
  depotToDistrictKm: number;
  depotToDistrictFreeflowMin: number;
  interStopKm: number;
  interStopFreeflowMin: number;
};

/** One row from service_allowance.csv. */
export type ServiceAllowance = {
  brand: Brand;
  dockType: DockType;
  minutes: number;
};

export type Lookup = {
  travel: TravelLeg[];
  allowances: ServiceAllowance[];
};

export type Vehicle = {
  id: string;
  type: VehicleType;
  temp: TempClass;
  weightCapKg: number;
  volumeCapM3: number;
  kmPerLitre: number;
  weeklyFuelQuotaL: number;
  depot: Depot;
};

export type Outlet = {
  id: string;
  brand: Brand;
  district: string;
  depot: Depot;
  dockType: DockType;
  parkingConstraint: ParkingConstraint;
  /** Minutes since midnight. 05:00 → 300. */
  windowOpenMin: number;
  windowCloseMin: number;
};

export type Order = {
  id: string;
  outletId: string;
  weightKg: number;
  volumeM3: number;
  chilled: boolean;
  serviceDate: string;
};

export type StopView = {
  order: Order;
  outlet: Outlet;
};

export type PlannedTrip = {
  id: string;
  vehicleId: string;
  serviceDate: string;
  tripNumber: 1 | 2;
};

export type TripView = {
  trip: PlannedTrip;
  vehicle: Vehicle;
  stops: StopView[];
};

export type RuleIssue = {
  code: ReasonCode;
  severity: 'block' | 'warn';
  message: string;
};
