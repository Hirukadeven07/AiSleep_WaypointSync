/**
 * Shared test fixtures. Numbers come from the competition CSVs.
 */
import { parseHhMm } from '../src/clock';
import type { Lookup, Order, Outlet, StopView, Vehicle } from '../src/types';

export const lookup: Lookup = {
  travel: [
    {
      district: 'Gampaha',
      depot: 'depo1',
      depotToDistrictKm: 28,
      depotToDistrictFreeflowMin: 37,
      interStopKm: 7,
      interStopFreeflowMin: 9,
    },
    {
      district: 'Colombo',
      depot: 'depo1',
      depotToDistrictKm: 12,
      depotToDistrictFreeflowMin: 24,
      interStopKm: 4,
      interStopFreeflowMin: 8,
    },
    {
      district: 'Kandy',
      depot: 'depo2',
      depotToDistrictKm: 8,
      depotToDistrictFreeflowMin: 16,
      interStopKm: 3,
      interStopFreeflowMin: 6,
    },
  ],
  allowances: [
    { brand: 'Fresh', dockType: 'rear_dock', minutes: 15 },
    { brand: 'Fresh', dockType: 'street', minutes: 16 },
    { brand: 'Fresh', dockType: 'mall_bay', minutes: 18 },
    { brand: 'Style', dockType: 'rear_dock', minutes: 38 },
    { brand: 'Style', dockType: 'street', minutes: 46 },
    { brand: 'Style', dockType: 'mall_bay', minutes: 59 },
    { brand: 'Tech', dockType: 'rear_dock', minutes: 43 },
    { brand: 'Tech', dockType: 'street', minutes: 55 },
    { brand: 'Tech', dockType: 'mall_bay', minutes: 55 },
  ],
};

export function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'VEH001',
    type: 'truck',
    temp: 'reefer',
    weightCapKg: 5510,
    volumeCapM3: 26.4,
    kmPerLitre: 4.7,
    weeklyFuelQuotaL: 340,
    depot: 'depo1',
    ...overrides,
  };
}

export function outlet(overrides: Partial<Outlet> = {}): Outlet {
  return {
    id: 'OUT001',
    brand: 'Fresh',
    district: 'Colombo',
    depot: 'depo1',
    dockType: 'street',
    parkingConstraint: 'normal',
    windowOpenMin: parseHhMm('05:00'),
    windowCloseMin: parseHhMm('07:30'),
    ...overrides,
  };
}

export function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ORD001',
    outletId: overrides.outletId ?? 'OUT001',
    weightKg: 200,
    volumeM3: 1.2,
    chilled: false,
    serviceDate: '2024-01-15',
    ...overrides,
  };
}

export function stop(outletOverrides: Partial<Outlet> = {}, orderOverrides: Partial<Order> = {}): StopView {
  const out = outlet(outletOverrides);
  return {
    outlet: out,
    order: order({ outletId: out.id, ...orderOverrides }),
  };
}
