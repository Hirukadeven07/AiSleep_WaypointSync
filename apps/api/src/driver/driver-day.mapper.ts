import type {
  DriverDayRoadIssue,
  DriverDayFlag,
  DriverDayPhone,
  DriverDayResponse,
  DriverDayStop,
  DriverDayTrip,
  DriverDayVehicle,
  FlagType,
  StopStatus,
  TripStatus,
} from '@waypoint/contracts';

/** Trips the driver can work today; the same statuses `SyncService.activeTripForDriver` uses. */
export const DRIVER_TRIP_STATUSES: TripStatus[] = ['published', 'loading', 'ready', 'on_road'];

/** Row shapes selected by `DriverService`, kept free of Prisma types so the mapper stays pure. */
export interface DriverDayFlagRow {
  id: string;
  type: FlagType;
  qty: number | null;
  note: string | null;
  orderLine: { name: string } | null;
}

export interface DriverDayStopRow {
  id: string;
  sequence: number;
  status: StopStatus;
  etaMin: number | null;
  arrivedAt: Date | null;
  storeConfirmedAt: Date | null;
  driverAckAt: Date | null;
  order: {
    id: string;
    urgentNote: string | null;
    store: {
      id: string;
      displayName: string | null;
      windowOpenMin: number;
      windowCloseMin: number;
      lat: number | null;
      lng: number | null;
      dockType: DriverDayStop['handover']['dockType'];
      parkingConstraint: DriverDayStop['handover']['parking'];
      mallWindow: string | null;
      district: { name: string };
      phones: DriverDayPhone[];
    };
  };
  flags: DriverDayFlagRow[];
}

export interface DriverDayTripRow {
  id: string;
  /** Optional so older callers and tests can leave it out; the trip's day is then `serviceDate`. */
  serviceDate?: Date;
  tripNumber: number;
  status: TripStatus;
  planVersion: number;
  stops: DriverDayStopRow[];
}

export interface DriverDayVehicleRow {
  id: string;
  numberPlate: string | null;
  type: DriverDayVehicle['type'];
  trips: DriverDayTripRow[];
}

const WORKABLE = new Set<TripStatus>(DRIVER_TRIP_STATUSES);
const iso = (value: Date | null) => value?.toISOString() ?? null;

/** The on_road trip if any, otherwise the lowest trip number. Matches `GET /api/sync`. */
export function pickActiveTripId(
  trips: ReadonlyArray<{ id: string; tripNumber: number; status: TripStatus }>,
): string | null {
  const onRoad = trips.find((trip) => trip.status === 'on_road');
  if (onRoad) return onRoad.id;
  const [first] = [...trips].sort((a, b) => a.tripNumber - b.tripNumber);
  return first?.id ?? null;
}

export function navigateUrl(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function pickPhone(phones: DriverDayPhone[]): string | null {
  const shop = phones.find((phone) => phone.label === 'shop');
  return shop?.phoneNo ?? phones[0]?.phoneNo ?? null;
}

function mapFlag(flag: DriverDayFlagRow): DriverDayFlag {
  return {
    id: flag.id,
    type: flag.type,
    qty: flag.qty,
    note: flag.note,
    itemName: flag.orderLine?.name ?? null,
  };
}

function mapStop(stop: DriverDayStopRow): DriverDayStop {
  const { store } = stop.order;
  const phones = store.phones.map(({ label, phoneNo }) => ({ label, phoneNo }));
  return {
    id: stop.id,
    sequence: stop.sequence,
    orderId: stop.order.id,
    storeId: store.id,
    outletName: store.displayName ?? store.id,
    address: store.district.name,
    status: stop.status,
    windowStart: store.windowOpenMin,
    windowEnd: store.windowCloseMin,
    eta: stop.etaMin,
    phone: pickPhone(phones),
    phones,
    lat: store.lat,
    lng: store.lng,
    navigateUrl: navigateUrl(store.lat, store.lng),
    urgentNote: stop.order.urgentNote,
    handover: {
      dockType: store.dockType,
      parking: store.parkingConstraint,
      mallWindow: store.mallWindow,
    },
    arrivedAt: iso(stop.arrivedAt),
    storeConfirmedAt: iso(stop.storeConfirmedAt),
    driverAckAt: iso(stop.driverAckAt),
    flags: stop.flags.map(mapFlag),
  };
}

function mapTrip(trip: DriverDayTripRow, serviceDate: string): DriverDayTrip {
  return {
    id: trip.id,
    serviceDate: trip.serviceDate?.toISOString().slice(0, 10) ?? serviceDate,
    tripNumber: trip.tripNumber as DriverDayTrip['tripNumber'],
    status: trip.status,
    planVersion: trip.planVersion,
    stops: [...trip.stops].sort((a, b) => a.sequence - b.sequence).map(mapStop),
  };
}

/** What the driver day carries besides today's vehicle and trips. */
export interface DriverDayExtras {
  upcoming?: DriverDayTripRow[];
  unreadNotices?: number;
  roadIssue?: DriverDayRoadIssue | null;
}

export function buildDriverDay(
  serviceDate: string,
  vehicle: DriverDayVehicleRow | null,
  extras: DriverDayExtras = {},
): DriverDayResponse {
  const common = {
    serviceDate,
    // Published trips on later days still show when the driver has no truck today.
    upcoming: (extras.upcoming ?? []).map((trip) => mapTrip(trip, serviceDate)),
    unreadNotices: extras.unreadNotices ?? 0,
    roadIssue: extras.roadIssue ?? null,
  };
  if (!vehicle) return { ...common, vehicle: null, trips: [], activeTripId: null };

  const trips = vehicle.trips
    .filter((trip) => WORKABLE.has(trip.status))
    .sort((a, b) => a.tripNumber - b.tripNumber);

  return {
    ...common,
    vehicle: { id: vehicle.id, plate: vehicle.numberPlate ?? vehicle.id, type: vehicle.type },
    trips: trips.map((trip) => mapTrip(trip, serviceDate)),
    activeTripId: pickActiveTripId(trips),
  };
}
