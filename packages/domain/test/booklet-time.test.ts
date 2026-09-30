import { describe, expect, it } from 'vitest';
import { computeTripMinutes } from '../src/time';
import { lookup, stop, vehicle } from './helpers';

describe('computeTripMinutes from CSV lookups', () => {
  it('Gampaha with 3 stops = 101 minutes (two rear_dock + one street, Fresh)', () => {
    const stops = [
      stop({ id: 'G1', brand: 'Fresh', district: 'Gampaha', dockType: 'rear_dock' }, { id: 'OG1' }),
      stop({ id: 'G2', brand: 'Fresh', district: 'Gampaha', dockType: 'rear_dock' }, { id: 'OG2' }),
      stop({ id: 'G3', brand: 'Fresh', district: 'Gampaha', dockType: 'street' }, { id: 'OG3' }),
    ];
    expect(computeTripMinutes(stops, lookup, 'Peliyagoda')).toBe(101);
  });

  it('Colombo with 4 street stops = 112 minutes (Fresh)', () => {
    const stops = [1, 2, 3, 4].map((n) =>
      stop({ id: `C${n}`, brand: 'Fresh', district: 'Colombo', dockType: 'street' }, { id: `OC${n}` }),
    );
    expect(computeTripMinutes(stops, lookup, 'Peliyagoda')).toBe(112);
  });

  it('empty trip is 0 minutes', () => {
    expect(computeTripMinutes([], lookup, vehicle().depot)).toBe(0);
  });
});
