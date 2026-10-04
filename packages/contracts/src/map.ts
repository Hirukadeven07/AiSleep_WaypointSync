import type { LiveStatus } from './dispatch';
import type { Brand, StopStatus } from './status';

/** One district on the island, painted from the depot that serves it. */
export interface MapDistrict {
  name: string;
  depotId: string | null;
  served: boolean;
}

export interface MapDepot {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Every store at the depot that has coordinates.
 * `hasOrder` is true when that store has an order on the map's date.
 */
export interface MapStore {
  storeId: string;
  storeName: string;
  brand: Brand;
  district: string;
  lat: number;
  lng: number;
  hasOrder: boolean;
  /** The order on this date, when the store has one. */
  orderId: string | null;
}

/** A store the planner can see. `plate` is set once the order is already on a trip. */
export interface PlanMapPin {
  orderId: string;
  storeId: string;
  storeName: string;
  brand: Brand;
  district: string;
  lat: number;
  lng: number;
  chilled: boolean;
  vanOnly: boolean;
  windowOpenMin: number;
  windowCloseMin: number;
  weightKg: number;
  volumeM3: number;
  plate: { tripId: string; tripNumber: number; vehiclePlate: string | null } | null;
}

/** A store on tomorrow's plan that has no coordinates yet. */
export interface UnplacedStore {
  orderId: string;
  storeId: string;
  storeName: string;
  district: string;
}

export interface PlanMap {
  date: string;
  depotId: string;
  depot: MapDepot | null;
  districts: MapDistrict[];
  pins: PlanMapPin[];
  /** All depot stores with a location. Ordered ones are drawn darker. */
  stores: MapStore[];
  /** Orders for the day whose store has no coordinates, so they cannot be pinned. */
  unplaced: number;
  unplacedStores: UnplacedStore[];
}

/** How a stop is drawn once a vehicle is selected. */
export type LocateStopKind = 'delivered' | 'next' | 'upcoming' | 'at_risk';

export interface LocateStop {
  id: string;
  sequence: number;
  storeName: string;
  district: string;
  lat: number | null;
  lng: number | null;
  status: StopStatus;
  kind: LocateStopKind;
  arrivedAt: string | null;
  windowOpenMin: number;
  windowCloseMin: number;
  /** Set when the store reported a short delivery. */
  issueNote: string | null;
}

/** The last store the driver has actually arrived at. Never a GPS guess. */
export interface LocateLastStop {
  stopId: string;
  storeName: string;
  lat: number | null;
  lng: number | null;
  arrivedAt: string;
}

export interface LocateTrip {
  id: string;
  vehicleId: string;
  plate: string | null;
  tripNumber: number;
  brand: Brand;
  district: string;
  driverName: string | null;
  live: LiveStatus;
  /** Minutes past a window, when `live` is late. */
  lateMin: number | null;
  stopsDone: number;
  stopsTotal: number;
  lastStop: LocateLastStop | null;
  /** Latest vehicle ping. The live map draws the truck here while it is between stops. */
  position: { lat: number; lng: number; recordedAt: string } | null;
  stops: LocateStop[];
}

export interface LocateMap {
  date: string;
  asOf: string;
  depotId: string;
  depots: MapDepot[];
  districts: MapDistrict[];
  /** All depot stores with a location. Ordered ones are drawn darker. */
  stores: MapStore[];
  /** Trips that have left the depot, or already finished, so a driver can be placed. */
  trips: LocateTrip[];
  /** Booklet departure of the next run still at the depot, when nothing is on the road. */
  firstDepartMin: number | null;
  firstDepartBrand: Brand | null;
}
