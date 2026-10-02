import { usedPct } from './plan.mapper';

describe('usedPct', () => {
  it('is 0 with no trips', () => {
    expect(usedPct(0, 0, 0, 0)).toBe(0);
  });

  it('counts each run of a vehicle as its own capacity', () => {
    // One 3000 kg truck on two runs carrying 1500 kg each: half full, not 100%.
    expect(usedPct(1500 + 1500, 3000 + 3000, 2, 30)).toBe(50);
  });

  it('reports volume when it is fuller than weight', () => {
    expect(usedPct(300, 3000, 12, 15)).toBe(80);
  });

  it('goes past 100 when the day is over capacity', () => {
    expect(usedPct(1900, 1500, 3, 8)).toBe(127);
  });
});
