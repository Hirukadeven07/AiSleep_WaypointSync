import { describe, expect, it } from 'vitest';
import { districtTone, interiorPoint, toneFor } from './districts';

describe('districtTone', () => {
  it('highlights the selected depot and dims the other one', () => {
    expect(districtTone({ depotId: 'Peliyagoda', served: true }, 'Peliyagoda')).toBe('active');
    expect(districtTone({ depotId: 'Kandy', served: true }, 'Peliyagoda')).toBe('other');
    expect(districtTone({ depotId: null, served: false }, 'Peliyagoda')).toBe('unserved');
  });
});

describe('interiorPoint', () => {
  it('stays inside a shape whose middle is a hole', () => {
    const ring: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 2],
      [3, 2],
      [3, 3],
      [0, 3],
      [0, 0],
    ];
    const [x, y] = interiorPoint(ring);
    const inNotch = x > 1 && y > 1 && y < 2;
    expect(inNotch).toBe(false);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(3);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(3);
  });
});

describe('toneFor', () => {
  it('matches either spelling of Moneragala', () => {
    const tones = new Map([['Moneragala', 'active' as const]]);
    expect(toneFor('Monaragala', tones)).toBe('active');
    expect(toneFor('Jaffna', tones)).toBe('unserved');
  });
});
