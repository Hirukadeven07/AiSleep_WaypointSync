import { fallbackMinutes, parseOsrm } from './driving-route';

describe('parseOsrm', () => {
  it('reads the duration and the road line', () => {
    const leg = parseOsrm({
      routes: [{ duration: 125, geometry: { coordinates: [[79.88, 6.96], [79.9, 6.95]] } }],
    });
    expect(leg).toEqual({ minutes: 2, line: [[79.88, 6.96], [79.9, 6.95]] });
  });

  it('returns null when the body has no route', () => {
    expect(parseOsrm({ routes: [] })).toBeNull();
    expect(parseOsrm(null)).toBeNull();
  });
});

describe('fallbackMinutes', () => {
  it('estimates at least a minute between two nearby points', () => {
    const minutes = fallbackMinutes([
      { lat: 6.9678, lng: 79.8832 },
      { lat: 6.9271, lng: 79.8612 },
    ]);
    expect(minutes).toBeGreaterThanOrEqual(1);
  });
});
