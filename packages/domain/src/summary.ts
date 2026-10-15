/**
 * Overbooked-day summary: demand vs available fleet, and the limiting resource.
 * Nest should already have filtered out-of-service vehicles.
 */
import type { Order, Outlet, Vehicle } from './types';

export type ResourceName = 'weight' | 'volume' | 'chilled' | 'vans';

export type CapacitySummary = {
  demandWeightKg: number;
  fleetWeightKg: number;
  demandVolumeM3: number;
  fleetVolumeM3: number;
  chilledOrderCount: number;
  reeferVehicleCount: number;
  vanOnlyOrderCount: number;
  vanCount: number;
  ratios: Record<ResourceName, number>;
  limitingResource: ResourceName | 'none';
  overbooked: boolean;
};

function ratio(demand: number, supply: number): number {
  if (demand === 0) {
    return 0;
  }
  if (supply === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return demand / supply;
}

export function capacitySummary(orders: Order[], outlets: Outlet[], vehicles: Vehicle[]): CapacitySummary {
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  const demandWeightKg = orders.reduce((sum, order) => sum + order.weightKg, 0);
  const demandVolumeM3 = orders.reduce((sum, order) => sum + order.volumeM3, 0);
  const fleetWeightKg = vehicles.reduce((sum, vehicle) => sum + vehicle.weightCapKg, 0);
  const fleetVolumeM3 = vehicles.reduce((sum, vehicle) => sum + vehicle.volumeCapM3, 0);
  const chilledOrders = orders.filter((order) => order.chilled);
  const reefers = vehicles.filter((vehicle) => vehicle.temp === 'reefer');
  const vanOnlyOrders = orders.filter(
    (order) => outletById.get(order.outletId)?.parkingConstraint === 'van_only',
  );
  const vans = vehicles.filter((vehicle) => vehicle.type === 'van');
  const chilledOrderCount = chilledOrders.length;
  const reeferVehicleCount = reefers.length;
  const vanOnlyOrderCount = vanOnlyOrders.length;
  const vanCount = vans.length;

  // A refrigerated truck carries many chilled stores, so chilled and van-only demand is weighed
  // against those vehicles' capacity (weight or volume, whichever is tighter), not counted 1:1.
  const sum = <T>(rows: T[], f: (row: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const tighter = (rows: Order[], fleet: Vehicle[]) =>
    Math.max(
      ratio(sum(rows, (o) => o.weightKg), sum(fleet, (v) => v.weightCapKg)),
      ratio(sum(rows, (o) => o.volumeM3), sum(fleet, (v) => v.volumeCapM3)),
    );

  const ratios: Record<ResourceName, number> = {
    weight: ratio(demandWeightKg, fleetWeightKg),
    volume: ratio(demandVolumeM3, fleetVolumeM3),
    chilled: tighter(chilledOrders, reefers),
    vans: tighter(vanOnlyOrders, vans),
  };

  const ranked = (Object.entries(ratios) as Array<[ResourceName, number]>).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const overbooked = ranked.some(([, value]) => value > 1);
  const limitingResource: ResourceName | 'none' = !top || top[1] === 0 ? 'none' : top[0];

  return {
    demandWeightKg,
    fleetWeightKg,
    demandVolumeM3,
    fleetVolumeM3,
    chilledOrderCount,
    reeferVehicleCount,
    vanOnlyOrderCount,
    vanCount,
    ratios,
    limitingResource,
    overbooked,
  };
}
