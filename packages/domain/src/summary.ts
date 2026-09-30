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
  const chilledOrderCount = orders.filter((order) => order.chilled).length;
  const reeferVehicleCount = vehicles.filter((vehicle) => vehicle.temp === 'reefer').length;
  const vanOnlyOrderCount = orders.filter(
    (order) => outletById.get(order.outletId)?.parkingConstraint === 'van_only',
  ).length;
  const vanCount = vehicles.filter((vehicle) => vehicle.type === 'van').length;

  const ratios: Record<ResourceName, number> = {
    weight: ratio(demandWeightKg, fleetWeightKg),
    volume: ratio(demandVolumeM3, fleetVolumeM3),
    chilled: ratio(chilledOrderCount, reeferVehicleCount),
    vans: ratio(vanOnlyOrderCount, vanCount),
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
