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

  it('weighs chilled demand against refrigerated capacity, not one order per truck', () => {
    const outlets = [outlet({ id: 'O1' })];
    const many = Array.from({ length: 5 }, (_, i) =>
      order({ id: `C${i}`, outletId: 'O1', chilled: true, weightKg: 100, volumeM3: 1 }),
    );
    const reefer = vehicle({ temp: 'reefer', weightCapKg: 3000, volumeCapM3: 15 });
    // Five small chilled orders fit one reefer: not overbooked.
    expect(capacitySummary(many, outlets, [reefer]).overbooked).toBe(false);
    // Chilled volume past the reefers' space: overbooked, limited by chilled.
    const big = many.map((o) => ({ ...o, volumeM3: 4 }));
    const summary = capacitySummary(big, outlets, [
      reefer,
      vehicle({ id: 'AMB', temp: 'ambient', weightCapKg: 9000, volumeCapM3: 60 }),
    ]);
    expect(summary.overbooked).toBe(true);
    expect(summary.limitingResource).toBe('chilled');
    expect(summary.ratios.chilled).toBeCloseTo(20 / 15);
  });

  it('is not overbooked when demand fits the fleet', () => {
    const summary = capacitySummary([order({ volumeM3: 1, weightKg: 10 })], [outlet()], [vehicle()]);
    expect(summary.overbooked).toBe(false);
  });
});
