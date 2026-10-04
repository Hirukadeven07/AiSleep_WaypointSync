import {
  circleRing,
  distanceM,
  fallbackDistricts,
  headingBack,
  insideDepotCircle,
  isOnRoad,
  lastVisited,
  locateLive,
  minutesLate,
  stopKind,
} from './map.logic';

const at = (iso: string) => new Date(iso);

describe('depot circle', () => {
  const depot = { lat: 6.9678, lng: 79.8832 };

  it('treats a point inside 500 m as back at the depot', () => {
    expect(insideDepotCircle({ lat: 6.97, lng: 79.884 }, depot)).toBe(true);
    expect(distanceM(depot, { lat: 6.97, lng: 79.884 })).toBeLessThan(500);
  });

  it('keeps a point a few kilometres away outside the circle', () => {
    expect(insideDepotCircle({ lat: 6.9271, lng: 79.8612 }, depot)).toBe(false);
  });

  it('closes the ring it draws around the yard', () => {
    const ring = circleRing(depot.lat, depot.lng, 500);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(8);
  });

  it('calls the driver heading back only after every stop is done', () => {
    expect(headingBack('on_road', ['delivered', 'confirmed'])).toBe(true);
    expect(headingBack('on_road', ['delivered', 'upcoming'])).toBe(false);
    expect(headingBack('completed', ['delivered'])).toBe(false);
  });
});

describe('fallbackDistricts', () => {
  it('paints the west coast for Peliyagoda and the hill country for Kandy', () => {
    const rows = fallbackDistricts();
    const depot = (name: string) => rows.find((row) => row.name === name)?.depotId;
    expect(depot('Colombo')).toBe('depo1');
    expect(depot('Galle')).toBe('depo1');
    expect(depot('Kandy')).toBe('depo2');
    expect(depot('Ratnapura')).toBe('depo2');
  });
});

describe('lastVisited', () => {
  it('picks the latest arrival and ignores stops the driver has not reached', () => {
    const stops = [
      { id: 'a', arrivedAt: at('2026-10-02T04:10:00Z') },
      { id: 'b', arrivedAt: null },
      { id: 'c', arrivedAt: at('2026-10-02T05:40:00Z') },
    ];
    expect(lastVisited(stops)?.id).toBe('c');
  });

  it('returns null when no stop has an arrival', () => {
    expect(lastVisited([{ arrivedAt: null }, { arrivedAt: null }])).toBeNull();
  });
});

describe('locateLive', () => {
  it('calls an on-road trip late only past the window threshold', () => {
    expect(
      locateLive({ status: 'on_road', broke: false, allDone: false, lateMin: 4, staleMin: 2 }),
    ).toBe('on_time');
    expect(
      locateLive({ status: 'on_road', broke: false, allDone: false, lateMin: 5, staleMin: 2 }),
    ).toBe('late');
  });

  it('prefers not-synced over late, and breakdown over both', () => {
    expect(
      locateLive({ status: 'on_road', broke: false, allDone: false, lateMin: 20, staleMin: 25 }),
    ).toBe('not_synced');
    expect(
      locateLive({ status: 'breakdown', broke: true, allDone: false, lateMin: 0, staleMin: 1 }),
    ).toBe('breakdown');
  });

  it('treats a finished on-road trip as completed', () => {
    expect(
      locateLive({ status: 'on_road', broke: false, allDone: true, lateMin: 0, staleMin: 1 }),
    ).toBe('completed');
    expect(isOnRoad('completed')).toBe(false);
    expect(isOnRoad('on_time')).toBe(true);
  });
});

describe('stopKind', () => {
  it('keeps a visited stop delivered even when it was the next one', () => {
    expect(stopKind('confirmed', null, true)).toBe('delivered');
  });

  it('marks a window miss as at risk before calling it the next stop', () => {
    expect(stopKind('upcoming', 12, true)).toBe('at_risk');
    expect(stopKind('upcoming', null, true)).toBe('next');
    expect(stopKind('upcoming', null, false)).toBe('upcoming');
  });

  it('counts minutes only for stops still ahead', () => {
    expect(minutesLate(620, 600, false)).toBe(20);
    expect(minutesLate(590, 600, false)).toBeNull();
    expect(minutesLate(620, 600, true)).toBeNull();
  });
});
