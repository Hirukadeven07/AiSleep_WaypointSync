/**
 * Prisma rows -> @waypoint/domain inputs. This is the only place the plan API converts shapes;
 * the rules themselves stay in the domain package.
 */
import type { Prisma, Vehicle as VehicleRow } from '@prisma/client';
import type { Depot, Lookup, Order, Outlet, StopView, Vehicle } from '@waypoint/domain';

export const orderInclude = {
  store: { include: { district: true } },
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const tripInclude = {
  vehicle: true,
  district: true,
  stops: { orderBy: { sequence: 'asc' }, include: { order: { include: orderInclude } } },
} satisfies Prisma.TripInclude;
export type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const asDepot = (id: string) => id as Depot;

export function toOutlet(store: OrderRow['store']): Outlet {
  return {
    id: store.id,
    brand: store.brand,
    district: store.district.name,
    depot: asDepot(store.depotId),
    dockType: store.dockType,
    parkingConstraint: store.parkingConstraint === 'van_only' ? 'van_only' : 'normal',
    windowOpenMin: store.windowOpenMin,
    windowCloseMin: store.windowCloseMin,
  };
}

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    outletId: row.storeId,
    weightKg: row.weightKg,
    volumeM3: row.volumeM3,
    chilled: row.temp === 'chilled',
    serviceDate: isoDate(row.deliveryDate),
  };
}

export function toStopView(row: OrderRow): StopView {
  return { order: toOrder(row), outlet: toOutlet(row.store) };
}

export function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    type: row.type,
    temp: row.temp,
    weightCapKg: row.weightCapKg,
    volumeCapM3: row.volumeCapM3,
    kmPerLitre: row.kmPerL ?? 0,
    weeklyFuelQuotaL: row.weeklyFuelQuotaL ?? 0,
    depot: asDepot(row.depotId),
  };
}

type DistrictRow = {
  name: string;
  depotId: string | null;
  depotToDistrictKm: number | null;
  depotToDistrictMin: number | null;
  interStopKm: number | null;
  interStopMin: number | null;
};
type AllowanceRow = { brand: Outlet['brand']; dockType: Outlet['dockType']; minutes: number };

/** Travel legs come from the district table; a row with a missing figure is left out so the domain reports it. */
export function toLookup(districts: DistrictRow[], allowances: AllowanceRow[]): Lookup {
  return {
    travel: districts.flatMap((d) =>
      d.depotId &&
      d.depotToDistrictKm != null &&
      d.depotToDistrictMin != null &&
      d.interStopKm != null &&
      d.interStopMin != null
        ? [
            {
              district: d.name,
              depot: asDepot(d.depotId),
              depotToDistrictKm: d.depotToDistrictKm,
              depotToDistrictFreeflowMin: d.depotToDistrictMin,
              interStopKm: d.interStopKm,
              interStopFreeflowMin: d.interStopMin,
            },
          ]
        : [],
    ),
    allowances: allowances.map((a) => ({
      brand: a.brand,
      dockType: a.dockType,
      minutes: a.minutes,
    })),
  };
}
