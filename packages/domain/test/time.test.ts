import { describe, expect, it } from 'vitest';
import { tripMinutes } from '../src/time';

describe('tripMinutes', () => {
  it('Gampaha: 3 stops', () => {
    expect(tripMinutes({ outboundMin: 37, interStopMin: 9, allowancesMin: [15, 15, 16] })).toBe(101);
  });
  it('Colombo: 4 stops', () => {
    expect(tripMinutes({ outboundMin: 24, interStopMin: 8, allowancesMin: [16, 16, 16, 16] })).toBe(112);
  });
  it('one stop has no inter-stop legs', () => {
    expect(tripMinutes({ outboundMin: 20, interStopMin: 5, allowancesMin: [15] })).toBe(35);
  });
});
