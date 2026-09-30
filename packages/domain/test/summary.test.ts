import { describe, expect, it } from 'vitest';
import { capacitySummary } from '../src/summary';
import { order, outlet, vehicle } from './helpers';

describe('capacity summary', () => {
  it('names volume as the limiting resource when volume ratio is highest', () => {
    const orders = [
      order({ id: 'A', volumeM3: 20, weightKg: 10, outletId: 'O1' }),
      order({ id: 'B', volumeM3: 20, weightKg: 10, outletId: 'O2' }),
    ];
    const outlets = [outlet({ id: 'O1' }), outlet({ id: 'O2' })];
    const vehicles = [vehicle({ volumeCapM3: 30, weightCapKg: 10_000 })];
    const summary = capacitySummary(orders, outlets, vehicles);
    expect(summary.overbooked).toBe(true);
    expect(summary.limitingResource).toBe('volume');
    expect(summary.ratios.volume).toBeCloseTo(40 / 30);
  });

  it('is not overbooked when demand fits the fleet', () => {
    const summary = capacitySummary([order({ volumeM3: 1, weightKg: 10 })], [outlet()], [vehicle()]);
    expect(summary.overbooked).toBe(false);
  });
});
