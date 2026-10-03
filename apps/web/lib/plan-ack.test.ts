import { describe, expect, it } from 'vitest';
import type { TripSummary } from './driver-cache';
import { planChange, snapshot } from './plan-ack';

const trip = (planVersion: number, stops: [string, string][]): TripSummary => ({
  id: 't1',
  tripNumber: 1,
  status: 'on_road',
  planVersion,
  stops: stops.map(([id, outletName], i) => ({
    id,
    outletName,
    sequence: i + 1,
    status: 'upcoming',
  })),
});

describe('planChange', () => {
  it('is not locked while the plan version is the accepted one', () => {
    const t = trip(2, [['s1', 'Store A']]);
    expect(planChange(snapshot(t), t)).toEqual({ locked: false, added: [], removed: [] });
  });

  it('is not locked before the phone has accepted any plan', () => {
    expect(planChange(null, trip(5, [['s1', 'Store A']])).locked).toBe(false);
  });

  it('locks on a newer plan and lists what was added and taken off', () => {
    const accepted = snapshot(
      trip(1, [
        ['s1', 'Store A'],
        ['s2', 'Store B'],
      ]),
    );
    const changed = trip(2, [
      ['s2', 'Store B'],
      ['s3', 'Store C'],
    ]);
    expect(planChange(accepted, changed)).toEqual({
      locked: true,
      added: ['Store C'],
      removed: ['Store A'],
    });
  });
});
