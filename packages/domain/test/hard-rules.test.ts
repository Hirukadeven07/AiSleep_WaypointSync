import { describe, expect, it } from 'vitest';
import { Reason } from '../src/reasons';
import { canAddStop, evaluateDrop, evaluateNewTrip } from '../src/rules/index';
import type { Lookup } from '../src/types';
import { lookup, stop, vehicle } from './helpers';

const truck = vehicle();
const empty: ReturnType<typeof stop>[] = [];

describe('hard rules — refuse the drop', () => {
  it('locks brand to the first stop', () => {
    const current = [stop({ id: 'OUT-F', brand: 'Fresh', district: 'Colombo' })];
    const candidate = stop({ id: 'OUT-S', brand: 'Style', district: 'Colombo' }, { id: 'ORD-S' });
    const issues = evaluateDrop({ vehicle: truck, currentStops: current, candidate, lookup });
    expect(issues.map((issue) => issue.code)).toContain(Reason.BRAND_MISMATCH);
    expect(canAddStop({ vehicle: truck, currentStops: current, candidate, lookup })).toBe(false);
  });

  it('warns, and still allows, a stop from another district', () => {
    const current = [stop({ id: 'OUT-C', brand: 'Fresh', district: 'Colombo' })];
    const candidate = stop({ id: 'OUT-G', brand: 'Fresh', district: 'Gampaha' }, { id: 'ORD-G' });
    const issues = evaluateDrop({ vehicle: truck, currentStops: current, candidate, lookup });
    const district = issues.find((issue) => issue.code === Reason.DISTRICT_MISMATCH);
    expect(district?.severity).toBe('warn');
    expect(canAddStop({ vehicle: truck, currentStops: current, candidate, lookup })).toBe(true);
  });

  it('allows a second Fresh Colombo stop on a Fresh Colombo trip', () => {
    const current = [stop({ id: 'OUT-A', brand: 'Fresh', district: 'Colombo', dockType: 'street' })];
    const candidate = stop(
      { id: 'OUT-B', brand: 'Fresh', district: 'Colombo', dockType: 'street' },
      { id: 'ORD-B' },
    );
    expect(canAddStop({ vehicle: truck, currentStops: current, candidate, lookup })).toBe(true);
  });

  it('refuses a Kandy outlet on a Peliyagoda vehicle', () => {
    const candidate = stop({ id: 'OUT-K', depot: 'depo2', district: 'Kandy' });
    const issues = evaluateDrop({ vehicle: truck, currentStops: empty, candidate, lookup });
    expect(issues.map((issue) => issue.code)).toContain(Reason.WRONG_DEPOT);
  });

  it('refuses chilled cargo on an ambient truck', () => {
    const ambient = vehicle({ id: 'VEH008', temp: 'ambient' });
    const candidate = stop({ id: 'OUT-CH' }, { id: 'ORD-CH', chilled: true });
    const issues = evaluateDrop({ vehicle: ambient, currentStops: empty, candidate, lookup });
    expect(issues.map((issue) => issue.code)).toContain(Reason.CHILLED_NEEDS_REEFER);
  });

  it('allows chilled cargo on a reefer', () => {
    const candidate = stop({ id: 'OUT-CH' }, { id: 'ORD-CH', chilled: true });
    expect(canAddStop({ vehicle: truck, currentStops: empty, candidate, lookup })).toBe(true);
  });

  it('warns when ambient cargo is placed on a reefer', () => {
    const candidate = stop({ id: 'OUT-AM' }, { id: 'ORD-AM', chilled: false });
    const issues = evaluateDrop({ vehicle: truck, currentStops: empty, candidate, lookup });
    const ambient = issues.find((issue) => issue.code === Reason.AMBIENT_ON_REEFER);
    expect(ambient?.severity).toBe('warn');
    expect(canAddStop({ vehicle: truck, currentStops: empty, candidate, lookup })).toBe(true);
  });

  it('refuses a van-only outlet on a truck', () => {
    const candidate = stop({ id: 'OUT-V', parkingConstraint: 'van_only' });
    const issues = evaluateDrop({ vehicle: truck, currentStops: empty, candidate, lookup });
    expect(issues.map((issue) => issue.code)).toContain(Reason.VAN_ONLY);
  });

  it('allows a van-only outlet on a van', () => {
    const van = vehicle({ id: 'VEH035', type: 'van', weightCapKg: 1040, volumeCapM3: 7 });
    const candidate = stop({ id: 'OUT-V', parkingConstraint: 'van_only' });
    expect(canAddStop({ vehicle: van, currentStops: empty, candidate, lookup })).toBe(true);
  });

  it('refuses a third trip for the same vehicle on the same day', () => {
    const issues = evaluateNewTrip(truck, 2);
    expect(issues.map((issue) => issue.code)).toContain(Reason.MAX_TRIPS);
  });

  it('allows a second trip for the same vehicle', () => {
    expect(evaluateNewTrip(truck, 1)).toEqual([]);
  });

  it('refuses a drop that would blow the Fresh 270-minute budget', () => {
    const current = Array.from({ length: 10 }, (_, index) =>
      stop(
        {
          id: `OUT-T${index}`,
          brand: 'Fresh',
          district: 'Colombo',
          dockType: 'street',
        },
        { id: `ORD-T${index}` },
      ),
    );
    const candidate = stop(
      { id: 'OUT-T10', brand: 'Fresh', district: 'Colombo', dockType: 'street' },
      { id: 'ORD-T10' },
    );
    const issues = evaluateDrop({ vehicle: truck, currentStops: current, candidate, lookup });
    expect(issues.find((issue) => issue.code === Reason.TIME_BUDGET)?.severity).toBe('block');
  });

  it('warns when the Fresh budget is over by 5 minutes and blocks at 6', () => {
    const budgetLookup = (allowanceMin: number): Lookup => ({
      travel: [
        {
          district: 'Colombo',
          depot: 'depo1',
          depotToDistrictKm: 1,
          depotToDistrictFreeflowMin: 270,
          interStopKm: 1,
          interStopFreeflowMin: 0,
        },
      ],
      allowances: [{ brand: 'Fresh', dockType: 'street', minutes: allowanceMin }],
    });
    const candidate = stop({ id: 'OUT-TIME', brand: 'Fresh', district: 'Colombo', dockType: 'street' });
    const warn = evaluateDrop({
      vehicle: truck,
      currentStops: empty,
      candidate,
      lookup: budgetLookup(5),
    }).find((issue) => issue.code === Reason.TIME_BUDGET);
    const block = evaluateDrop({
      vehicle: truck,
      currentStops: empty,
      candidate,
      lookup: budgetLookup(6),
    }).find((issue) => issue.code === Reason.TIME_BUDGET);
    expect(warn?.severity).toBe('warn');
    expect(block?.severity).toBe('block');
  });
});

describe('capacity is not a drop block', () => {
  it('still allows the drop when the truck is over volume', () => {
    const tiny = vehicle({ volumeCapM3: 1, weightCapKg: 100 });
    const current = [stop({ id: 'OUT-1' }, { id: 'ORD-1', volumeM3: 0.8, weightKg: 50 })];
    const candidate = stop({ id: 'OUT-2' }, { id: 'ORD-2', volumeM3: 0.8, weightKg: 50 });
    expect(canAddStop({ vehicle: tiny, currentStops: current, candidate, lookup })).toBe(true);
  });
});
