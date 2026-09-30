import { describe, expect, it } from 'vitest';
import { isoWeekKey } from '../src/clock';
import { checkFuelQuota, estimateTripLitres, tripKm, tripLitres } from '../src/fuel';
import { Reason } from '../src/reasons';
import { lookup, stop, vehicle } from './helpers';

describe('fuel estimate', () => {
  it('uses a round trip: 2 × depot-to-district km + inter-stop × (stops-1)', () => {
    expect(tripKm(4, 12, 4)).toBe(36);
    expect(tripLitres(36, 4.7)).toBeCloseTo(36 / 4.7);
  });

  it('matches estimateTripLitres for the Colombo 4-stop run', () => {
    const truck = vehicle({ kmPerLitre: 4.7 });
    const stops = [1, 2, 3, 4].map((n) =>
      stop({ id: `C${n}`, brand: 'Fresh', district: 'Colombo', dockType: 'street' }, { id: `OC${n}` }),
    );
    expect(estimateTripLitres(stops, lookup, truck)).toBeCloseTo(36 / 4.7);
  });

  it('warns when the ISO week planned litres exceed the quota', () => {
    const truck = vehicle({ weeklyFuelQuotaL: 10 });
    const issues = checkFuelQuota('2024-01-15', 11, truck);
    expect(issues[0]?.code).toBe(Reason.FUEL_QUOTA);
    expect(issues[0]?.severity).toBe('warn');
  });

  it('tags 2024-01-01 as ISO week 2024-W01 (matches calendar.csv)', () => {
    expect(isoWeekKey('2024-01-01')).toBe('2024-W01');
  });
});
