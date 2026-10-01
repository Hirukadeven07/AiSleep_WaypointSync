import { describe, expect, it } from 'vitest';
import { rankVehiclesForOrder } from '../src/fit';
import { Reason } from '../src/reasons';
import type { TripView } from '../src/types';
import { lookup, order, outlet, stop, vehicle } from './helpers';

describe('vehicle fit ranking', () => {
  const chilledOrder = order({ id: 'ORD-CH', chilled: true, outletId: 'OUT-CH' });
  const chilledOutlet = outlet({ id: 'OUT-CH' });

  it('puts a legal reefer ahead of an ambient truck for a chilled order', () => {
    const reefer = vehicle({ id: 'VEH-R', temp: 'reefer' });
    const ambient = vehicle({ id: 'VEH-A', temp: 'ambient' });
    const ranked = rankVehiclesForOrder({
      order: chilledOrder,
      outlet: chilledOutlet,
      vehicles: [ambient, reefer],
      trips: [],
      tripsTakenToday: {},
      lookup,
    });
    expect(ranked[0]?.vehicle.id).toBe('VEH-R');
    expect(ranked[0]?.hardBlocked).toBe(false);
    expect(ranked[1]?.hardBlocked).toBe(true);
    expect(ranked[1]?.issues.map((issue) => issue.code)).toContain(Reason.CHILLED_NEEDS_REEFER);
  });

  it('hard-blocks a truck for a van-only store', () => {
    const ranked = rankVehiclesForOrder({
      order: order({ outletId: 'OUT-V' }),
      outlet: outlet({ id: 'OUT-V', parkingConstraint: 'van_only' }),
      vehicles: [vehicle({ id: 'TRUCK', type: 'truck' })],
      trips: [],
      tripsTakenToday: {},
      lookup,
    });
    expect(ranked[0]?.hardBlocked).toBe(true);
    expect(ranked[0]?.issues.map((issue) => issue.code)).toContain(Reason.VAN_ONLY);
  });

  it('offers a same-brand trip in another district as a warning, behind a same-district trip', () => {
    const truck = vehicle({ id: 'VEH-1' });
    const colombo = stop({ id: 'OUT-C', brand: 'Fresh', district: 'Colombo' }, { id: 'ORD-C' });
    const gampahaTrip: TripView = {
      trip: { id: 'TRIP-G', vehicleId: truck.id, serviceDate: '2024-01-15', tripNumber: 1 },
      vehicle: truck,
      stops: [stop({ id: 'OUT-G', brand: 'Fresh', district: 'Gampaha' }, { id: 'ORD-G' })],
    };
    const colomboTrip: TripView = {
      trip: { id: 'TRIP-C', vehicleId: truck.id, serviceDate: '2024-01-15', tripNumber: 2 },
      vehicle: truck,
      stops: [colombo],
    };
    const ranked = rankVehiclesForOrder({
      order: order({ id: 'ORD-NEW', outletId: 'OUT-NEW' }),
      outlet: outlet({ id: 'OUT-NEW', brand: 'Fresh', district: 'Colombo' }),
      vehicles: [truck],
      trips: [gampahaTrip, colomboTrip],
      tripsTakenToday: {},
      lookup,
    });
    expect(ranked[0]?.tripId).toBe('TRIP-C');
    expect(ranked[0]?.hardBlocked).toBe(false);
    const otherDistrict = ranked.find((option) => option.tripId === 'TRIP-G');
    expect(otherDistrict?.hardBlocked).toBe(false);
    expect(otherDistrict?.issues.map((issue) => issue.code)).toContain(Reason.DISTRICT_MISMATCH);
  });
});
