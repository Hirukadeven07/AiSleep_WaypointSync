import { describe, expect, it } from 'vitest';
import { rankVehiclesForOrder } from '../src/fit';
import { Reason } from '../src/reasons';
import { lookup, order, outlet, vehicle } from './helpers';

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
});
