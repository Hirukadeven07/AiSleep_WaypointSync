import { describe, expect, it } from 'vitest';
import { proposeAssignments } from '../src/assign';
import { lookup, order, outlet, vehicle } from './helpers';

describe('auto-assign proposal', () => {
  it('leaves an order unassigned rather than overloading the only truck', () => {
    const truck = vehicle({ id: 'T1', temp: 'reefer', volumeCapM3: 10, weightCapKg: 5000 });
    const orders = [
      order({ id: 'A', outletId: 'O1', chilled: true, volumeM3: 6 }),
      order({ id: 'B', outletId: 'O2', chilled: true, volumeM3: 6 }),
    ];
    const outlets = [outlet({ id: 'O1' }), outlet({ id: 'O2' })];
    const result = proposeAssignments({
      orders,
      outlets,
      vehicles: [truck],
      trips: [],
      tripsTakenToday: {},
      lookup,
    });
    const placed = result.filter((a) => a.assigned);
    // One fits; the second would put 12 m³ on a 10 m³ truck (or open a third trip it cannot take).
    expect(placed.length).toBeLessThan(2);
    expect(result.some((a) => !a.assigned)).toBe(true);
  });
});
