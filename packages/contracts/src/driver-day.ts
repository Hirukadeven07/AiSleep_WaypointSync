import type { FlagType } from './dock';
import type { StopStatus, TripStatus } from './status';

/** The vehicle linked to the driver by `Vehicle.driverId`. */
export interface DriverDayVehicle {
  id: string;
  /** Falls back to the vehicle id when the vehicle has no plate. */
  plate: string;
  type: 'truck' | 'van';
}

export interface DriverDayPhone {
  label: 'shop' | 'manager' | 'warehouse';
  phoneNo: string;
}

/** A loader flag raised against the stop's order. */
export interface DriverDayFlag {
  id: string;
  type: FlagType;
  qty: number | null;
  note: string | null;
  /** The flagged order line's name, if the flag names a line. */
  itemName: string | null;
}

/** How the goods are handed over at the store. */
export interface DriverDayHandover {
  dockType: 'rear_dock' | 'street' | 'mall_bay';
  /** van_only: only a van can park; mall_dock: use the mall's goods dock. */
  parking: 'normal' | 'van_only' | 'mall_dock';
  /** The mall's delivery slot, e.g. "06:00-08:00", when the store is in a mall. */
  mallWindow: string | null;
}

export interface DriverDayStop {
  id: string;
  sequence: number;
  orderId: string;
  storeId: string;
  /** Store display name, or the store id when it has none. */
  outletName: string;
  /** The store's district name; `Store` has no street address column. */
  address: string;
  status: StopStatus;
  /** Delivery window open, minutes since midnight. */
  windowStart: number;
  /** Delivery window close, minutes since midnight. */
  windowEnd: number;
  /** Planned arrival, minutes since midnight. */
  eta: number | null;
  /** Best number to call: the shop phone, else the store phone, else any outlet phone. */
  phone: string | null;
  phones: DriverDayPhone[];
  lat: number | null;
  lng: number | null;
  /** Google Maps directions link; null when the store has no coordinates. */
  navigateUrl: string | null;
  urgentNote: string | null;
  handover: DriverDayHandover;
  /** ISO timestamps. */
  arrivedAt: string | null;
  storeConfirmedAt: string | null;
  driverAckAt: string | null;
  flags: DriverDayFlag[];
}

export interface DriverDayTrip {
  id: string;
  tripNumber: 1 | 2;
  status: TripStatus;
  planVersion: number;
  stops: DriverDayStop[];
}

/** GET /api/driver/day. Only workable trips (published, loading, ready, on_road) for today. */
export interface DriverDayResponse {
  /** YYYY-MM-DD in Asia/Colombo. */
  serviceDate: string;
  vehicle: DriverDayVehicle | null;
  trips: DriverDayTrip[];
  /** Same rule as `GET /api/sync`: the on_road trip, else the lowest trip number. */
  activeTripId: string | null;
}
