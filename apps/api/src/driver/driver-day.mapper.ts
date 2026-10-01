import type {
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
      phone: string | null;
      district: { name: string };
      phones: DriverDayPhone[];
    };
  };
  flags: DriverDayFlagRow[];
}

export interface DriverDayTripRow {
  id: string;
  tripNumber: number;
  status: TripStatus;
  planVersion: number;
  stops: DriverDayStopRow[];
}

export interface DriverDayVehicleRow {
  id: string;
  plate: string | null;
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

function pickPhone(storePhone: string | null, phones: DriverDayPhone[]): string | null {
  const shop = phones.find((phone) => phone.label === 'shop');
  return shop?.phoneNo ?? storePhone ?? phones[0]?.phoneNo ?? null;
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
    phone: pickPhone(store.phone, phones),
    phones,
    lat: store.lat,
    lng: store.lng,
    navigateUrl: navigateUrl(store.lat, store.lng),
    urgentNote: stop.order.urgentNote,
    arrivedAt: iso(stop.arrivedAt),
    storeConfirmedAt: iso(stop.storeConfirmedAt),
    driverAckAt: iso(stop.driverAckAt),
    flags: stop.flags.map(mapFlag),
  };
}

function mapTrip(trip: DriverDayTripRow): DriverDayTrip {
  return {
    id: trip.id,
    tripNumber: trip.tripNumber as DriverDayTrip['tripNumber'],
    status: trip.status,
    planVersion: trip.planVersion,
    stops: [...trip.stops].sort((a, b) => a.sequence - b.sequence).map(mapStop),
  };
}

export function buildDriverDay(
  serviceDate: string,
  vehicle: DriverDayVehicleRow | null,
): DriverDayResponse {
  if (!vehicle) return { serviceDate, vehicle: null, trips: [], activeTripId: null };

  const trips = vehicle.trips
    .filter((trip) => WORKABLE.has(trip.status))
    .sort((a, b) => a.tripNumber - b.tripNumber);

  return {
    serviceDate,
    vehicle: { id: vehicle.id, plate: vehicle.plate ?? vehicle.id, type: vehicle.type },
    trips: trips.map(mapTrip),
    activeTripId: pickActiveTripId(trips),
  };
}
