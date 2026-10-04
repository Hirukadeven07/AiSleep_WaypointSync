import type { FlagType } from './dock';
import type { RoadIssueKind } from './driver-event';
import type { StopStatus, TripStatus } from './status';

/** The vehicle of the driver's active trip, else the vehicle registered to them (`Vehicle.driverId`). */
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
  /** Best number to call: the shop OutletPhone, else any outlet phone. */
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
  /** YYYY-MM-DD. Today for `trips`, a later day for `upcoming`. */
  serviceDate: string;
  tripNumber: 1 | 2;
  status: TripStatus;
  planVersion: number;
  stops: DriverDayStop[];
}

/**
 * GET /api/driver/day. A trip is the driver's when the dispatcher assigned them to it
 * (`Trip.assignedDriverId`), or, with nobody assigned, when it runs on their vehicle.
 */
export interface DriverDayResponse {
  /** YYYY-MM-DD in Asia/Colombo. */
  serviceDate: string;
  vehicle: DriverDayVehicle | null;
  /** Today's workable trips (published, loading, ready, on_road). */
  trips: DriverDayTrip[];
  /** Same rule as `GET /api/sync`: the on_road trip, else the lowest trip number. */
  activeTripId: string | null;
  /** Published trips on the next few days, read-only until their day. */
  upcoming: DriverDayTrip[];
  /** Unread notices from dispatch and stores (GET /api/driver/notices). */
  unreadNotices: number;
  /** The road issue reported on the active trip and not resolved yet: the next stop is paused. */
  roadIssue: DriverDayRoadIssue | null;
  /** Today's breaks, from the driver's BREAK_START / BREAK_END events. */
  break: DriverDayBreak;
  /**
   * Set once every stop on the active trip is done and the truck is still outside the depot circle.
   * Null while stops remain, or after the truck has arrived back.
   */
  returnToDepot: { minutes: number; etaAt: string } | null;
}

export interface DriverDayBreak {
  /** Set while the driver is on a break. */
  onBreakSince: string | null;
  /** Minutes of finished breaks today (the running one is not counted). */
  usedMin: number;
  allowanceMin: number;
}

/** GET /api/driver/profile. */
export interface DriverProfile {
  name: string;
  loginId: string;
  phone: string | null;
  depotId: string | null;
  licenseNo: string | null;
  /** YYYY-MM-DD, when the driving licence expires; null if not recorded. */
  licenseExpiry: string | null;
  vehicle: {
    id: string;
    plate: string;
    type: 'truck' | 'van';
    temp: 'reefer' | 'ambient';
    weightCapKg: number;
    volumeCapM3: number;
  } | null;
  /** The driver's latest trips up to today, newest first. */
  recentTrips: {
    id: string;
    serviceDate: string;
    tripNumber: number;
    status: TripStatus;
    plate: string;
    stopsDone: number;
    stopsTotal: number;
  }[];
}

export interface DriverDayRoadIssue {
  tripId: string;
  kind: RoadIssueKind;
  note: string | null;
  reportedAt: string;
}

/** GET /api/driver/notices: what dispatch and stores sent this driver, newest first. */
export interface DriverNotice {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
