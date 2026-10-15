import { describe, expect, it } from 'vitest';
import type { LiveStop, LiveTrip } from '@waypoint/contracts';
import { tripReportFilename, tripReportLines } from './trip-report';

const stop = (over: Partial<LiveStop>): LiveStop => ({
  id: 's1',
  sequence: 1,
  storeName: 'OUT001',
  status: 'confirmed',
  windowOpenMin: 540,
  windowCloseMin: 600,
  etaMin: null,
  arrivedAt: '2026-10-04T03:48:00Z',
  confirmed: true,
  issueNote: null,
  missBy: null,
  ...over,
});

const trip = {
  id: 't1',
  vehicleId: 'v1',
  plate: 'WP LQ-1035',
  tripNumber: 1,
  brand: 'Fresh',
  district: 'Colombo',
  vehicleType: 'van',
  vehicleTemp: 'ambient',
  driverName: 'Hasitha Nazeer',
  live: 'completed',
  lateMin: null,
  stopsDone: 2,
  stopsTotal: 2,
  weightKg: 812.4,
  departedAt: '2026-10-04T03:00:00Z',
  backAt: '2026-10-04T04:10:00Z',
  stops: [
    stop({}),
    stop({
      id: 's2',
      sequence: 2,
      status: 'partial',
      confirmed: false,
      issueNote: '1 item damaged',
    }),
  ],
} as unknown as LiveTrip;

const now = new Date('2026-10-04T05:00:00Z');
const all = (t: LiveTrip) => tripReportLines(t, now).flatMap((l) => l.cells.map((c) => c.text));

describe('trip report', () => {
  it('lists the trip facts and every stop with its result', () => {
    const texts = all(trip);
    expect(texts).toEqual(
      expect.arrayContaining([
        'WP LQ-1035 · Trip 1',
        'Van · WP LQ-1035',
        'Hasitha Nazeer',
        'Completed',
        '8:30',
        '9:40',
        '2 of 2 stops',
        '812 kg',
        '9:00-10:00',
        '9:18',
        'Partial',
        'Not confirmed',
        'Store reported: 1 item damaged',
        '1 of 2 confirmed by the store · 1 with a reported problem',
      ]),
    );
  });

  it('names the file after the plate, trip and Colombo day', () => {
    expect(tripReportFilename(trip, now)).toBe('trip-report-WP-LQ-1035-trip-1-2026-10-04.pdf');
  });
});
